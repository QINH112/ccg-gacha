"use strict";

const {spawnSync}=require("child_process");
const path=require("path");

if(!process.env.BALANCE_NOTICE_CASE){
  for(const scenario of["empty","error","long"]){
    const result=spawnSync(process.execPath,[__filename],{cwd:path.resolve(__dirname,".."),env:{...process.env,BALANCE_NOTICE_CASE:scenario},encoding:"utf8"});
    if(result.stdout)process.stdout.write(result.stdout);
    if(result.stderr)process.stderr.write(result.stderr);
    if(result.status!==0)process.exit(result.status||1);
  }
  console.log("balance-notice-state-smoke-ok cases=empty,error,long");
  process.exit(0);
}

const scenario=process.env.BALANCE_NOTICE_CASE,noop=()=>{},handlers={},renderedText=[],toasts=[],cloudCalls=[];
const gradient={addColorStop:noop};
const context=new Proxy({createLinearGradient:()=>gradient,measureText:value=>({width:String(value).length*8}),roundRect:noop,fillText:value=>renderedText.push(String(value))},{get(target,property){return property in target?target[property]:noop;},set(target,property,value){target[property]=value;return true;}});
global.setInterval=()=>0;

const player={inventory:[],totalDraws:0,dust:0,ticket:100,coin:1000,pity:{},signIn:{firstCycleDay:0},uiState:{lastReadBalanceNoticeId:""}};
const changes=Array.from({length:12},(_,index)=>({cardId:`c${String(index+1).padStart(3,"0")}`,name:`边界测试卡 ${index+1}`,before:{cost:1,attack:1,health:1,keywords:[],rulesText:"修改前效果文字用于验证长公告显示。"},after:{cost:2,attack:2,health:2,keywords:index===11?["guard"]:[],rulesText:"修改后效果文字用于验证长公告显示。"},note:`第 ${index+1} 项调整说明。`}));
function noticeState(){if(scenario==="empty")return{status:"ready",latest:null,items:[]};if(scenario==="error")return{status:"error",latest:null,items:[]};const latest={id:"balance-long",title:"长公告测试",summary:"验证十二张卡牌的长列表滚动。",publishedAt:1794950400000,changes};return{status:"ready",latest,items:[latest]};}
function cloudResult(name,data){cloudCalls.push(`${name}:${data&&data.action||""}`);if(name==="gameData"&&data.action==="markBalanceNoticeRead")return{player:{...player,uiState:{lastReadBalanceNoticeId:data.noticeId}},noticeId:data.noticeId,hasUnreadBalanceNotice:false};if(name==="gameData")return{player,cards:[],sets:[{id:"base",name:"基础卡牌包"}],pools:[{id:"base",name:"基础召唤池",setIds:["base"],enabled:true}],config:{signIn:{firstCycle:[{type:"ticket",amount:50}]}},signStatus:{claimedToday:true,firstCycle:true,day:1},userKey:"notice-state",balanceNotices:noticeState(),hasUnreadBalanceNotice:scenario==="long"};if(name==="gameServices")return{player,shop:{ticketPrice:100,maxQuantity:99},mail:[],tasks:{daily:{tasks:[],bonus:null},weekly:{tasks:[],bonus:null},achievements:[]},redDots:{mail:false,tasks:false,achievements:false}};throw new Error(`Unexpected cloud call: ${name}`);}

global.wx={
  getSystemInfoSync:()=>({windowWidth:393,windowHeight:852,pixelRatio:2,safeArea:{top:0,bottom:852}}),
  getMenuButtonBoundingClientRect:()=>({bottom:82}),
  createCanvas:()=>({getContext:()=>context,width:0,height:0}),
  createImage:()=>{const image={};Object.defineProperty(image,"src",{set(){if(typeof image.onload==="function")image.onload();}});return image;},
  cloud:{init:noop,callFunction:({name,data})=>Promise.resolve({result:cloudResult(name,data||{})})},
  onTouchStart:callback=>{handlers.touchStart=callback;},onTouchMove:callback=>{handlers.touchMove=callback;},onTouchEnd:callback=>{handlers.touchEnd=callback;},onTouchCancel:callback=>{handlers.touchCancel=callback;},onShow:callback=>{handlers.show=callback;},
  showShareMenu:noop,onShareAppMessage:noop,showModal:noop,showActionSheet:noop,showToast:options=>toasts.push(options.title)
};

require("../game.js");
function tap(x,y){handlers.touchStart({touches:[{clientX:x,clientY:y}]});handlers.touchEnd({changedTouches:[{clientX:x,clientY:y}]});}
function swipeUp(){handlers.touchStart({touches:[{clientX:196,clientY:720}]});handlers.touchMove({touches:[{clientX:196,clientY:150}]});handlers.touchEnd({changedTouches:[{clientX:196,clientY:150}]});}
async function settle(){await Promise.resolve();await new Promise(resolve=>setImmediate(resolve));await Promise.resolve();}

(async()=>{
  await settle();
  tap(354,610);
  await settle();
  if(scenario==="empty"){
    if(!toasts.includes("暂无卡牌调整公告"))throw new Error("Empty notice toast missing");
  }else if(scenario==="error"){
    if(!toasts.includes("卡牌调整公告加载失败，请稍后重试"))throw new Error("Error notice toast missing");
  }else{
    if(!renderedText.some(value=>value.includes("边界测试卡 1")))throw new Error("Latest notice did not open");
    for(let index=0;index<8;index+=1)swipeUp();
    await settle();
    if(!renderedText.some(value=>value.includes("边界测试卡 12")))throw new Error("Long notice did not scroll to final change");
    if(!cloudCalls.includes("gameData:markBalanceNoticeRead"))throw new Error("Latest notice read state was not saved");
  }
  console.log(`balance-notice-case-ok ${scenario}`);
})().catch(error=>{console.error(error);process.exitCode=1;});
