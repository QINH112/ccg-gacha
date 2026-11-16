"use strict";

const api = require("./utils/storage");
const RARITIES = ["common","rare","epic","legendary"];
const RARITY_LABEL = { common:"普通",rare:"稀有",epic:"史诗",legendary:"传说" };
const COLORS = { common:{border:"#8993aa",fill:"#222b43",accent:"#d5dae7"},rare:{border:"#55a9f3",fill:"#173b61",accent:"#82c7ff"},epic:{border:"#b76de5",fill:"#49256b",accent:"#dda2ff"},legendary:{border:"#e8bb5e",fill:"#70461d",accent:"#ffdb7e"} };
const SIGN_LAYOUT = {
  margin: 20,
  topOffset: 35,
  headerHeight: 82,
  rewardRowHeight: 45,// 每天奖励行高度
  rewardGap: 5, // 奖励行间距
  actionGap: 10,// Day7 与按钮之间的距离
  actionHeight: 40,// 领取按钮高度
  footerHeight: 38,  // 按钮下方提示区域
  bottomPadding: 10 // 面板底部留白
};
const HOME_LAYOUT = {
  menuButtonGap: 18,
  fallbackTopGap: 20
};
const info=wx.getSystemInfoSync(),canvas=wx.createCanvas(),ctx=canvas.getContext("2d"),ratio=Math.max(1,info.pixelRatio||1),W=info.windowWidth,H=info.windowHeight,safe=info.safeArea||{top:0,bottom:H},safeTop=Math.max(12,safe.top||0),safeBottom=Math.max(10,H-(safe.bottom||H));
canvas.width=W*ratio;canvas.height=H*ratio;ctx.scale(ratio,ratio);

const state={screen:"home",player:null,cards:[],sets:[],pools:[],config:null,configReady:false,hasLoaded:false,signStatus:null,userKey:"",selectedPoolId:"",collectionFilter:"all",hit:[],scrollY:0,maxScroll:0,poolScrollX:0,maxPoolScroll:0,poolArea:null,touchX:0,touchY:0,lastX:0,lastY:0,moved:false,loading:true,error:"",results:[],resultLabel:"",showResults:false,showSign:false,history:[],expandedHistory:"",shop:{ticketPrice:100,maxQuantity:99},mail:[],tasks:{daily:{tasks:[],bonus:null},weekly:{tasks:[],bonus:null},achievements:[]},redDots:{mail:false,tasks:false,achievements:false},taskTab:"daily"};

function emptyPlayer(){return{inventory:[],totalDraws:0,dust:0,ticket:0,coin:0,pity:{}};}
function homeContentTop(){
  try{
    if(typeof wx.getMenuButtonBoundingClientRect==="function"){
      const menuButton=wx.getMenuButtonBoundingClientRect();
      if(menuButton&&Number(menuButton.bottom)>0)return Math.max(safeTop+HOME_LAYOUT.fallbackTopGap,Number(menuButton.bottom)+HOME_LAYOUT.menuButtonGap);
    }
  }catch(error){console.warn("读取微信胶囊按钮位置失败",error);}
  return safeTop+HOME_LAYOUT.fallbackTopGap;
}
function rr(x,y,w,h,r){ctx.beginPath();ctx.roundRect?ctx.roundRect(x,y,w,h,r):(ctx.rect(x,y,w,h));}
function box(x,y,w,h,r,fill,stroke){rr(x,y,w,h,r);if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1;ctx.stroke();}}
function text(value,x,y,size,color,align,weight){ctx.font=`${weight||400} ${size}px sans-serif`;ctx.fillStyle=color||"#fff";ctx.textAlign=align||"left";ctx.textBaseline="middle";ctx.fillText(String(value),x,y);}
function fit(value,max,size){ctx.font=`400 ${size}px sans-serif`;let out=String(value);while(out.length>1&&ctx.measureText(out).width>max)out=out.slice(0,-2)+"…";return out;}
function gradient(y,h,a,b){const g=ctx.createLinearGradient(0,y,0,y+h);g.addColorStop(0,a);g.addColorStop(1,b);return g;}
function bg(a,b){ctx.clearRect(0,0,W,H);ctx.fillStyle=gradient(0,H,a||"#29265a",b||"#080c1a");ctx.fillRect(0,0,W,H);for(let i=0;i<25;i++){ctx.fillStyle="rgba(190,190,255,.25)";ctx.fillRect((i*79)%W,(i*131)%H,1,1);}}
function hit(id,x,y,w,h,data){state.hit.push({id,x,y,w,h,data});}
function button(id,x,y,w,h,title,sub,enabled,data){box(x,y,w,h,10,enabled?gradient(y,h,"#6756a8","#30295d"):"#242940",enabled?"#8978ca":"#454b64");text(title,x+w/2,y+(sub?h*.38:h/2),sub?15:13,enabled?"#fff":"#707891","center",700);if(sub)text(sub,x+w/2,y+h*.72,10,enabled?"#d7d7ec":"#646a82","center");if(enabled)hit(id,x,y,w,h,data);}
function inventory(cardId){return(state.player.inventory||[]).find(item=>item.cardId===cardId)||{normalCount:0,shinyCount:0};}
function ownedCount(){return(state.player.inventory||[]).reduce((sum,item)=>sum+item.normalCount+item.shinyCount,0);}
function cloudError(error){return String(error&&error.message||error||"云端请求失败").replace(/^Error:\s*/,"");}
function syncServices(result){if(!result)return;if(result.player)state.player=result.player;if(result.shop)state.shop=result.shop;if(result.mail)state.mail=result.mail;if(result.tasks)state.tasks=result.tasks;if(result.redDots)state.redDots=result.redDots;}
function call(task,success){state.loading=true;state.error="";render();return task.then(result=>{if(result.player)state.player=result.player;if(success)success(result);return api.loadServices().then(service=>syncServices(service)).catch(error=>{console.warn("操作成功，但刷新服务面板失败",error);}).then(()=>result);}).catch(error=>{state.error=cloudError(error);wx.showModal({title:"云端操作失败",content:state.error.slice(0,240),showCancel:false});return null;}).finally(()=>{state.loading=false;render();});}

function refresh(showSign){state.loading=true;state.configReady=false;state.error="";return api.initCloud().then(()=>api.loadGameData()).then(result=>{state.player=result.player;state.cards=result.cards;state.sets=result.sets;state.pools=result.pools;state.config=result.config;state.signStatus=result.signStatus;state.userKey=result.userKey;return api.loadServices();}).then(service=>{syncServices(service);state.configReady=true;state.hasLoaded=true;if(showSign&&state.signStatus&&!state.signStatus.claimedToday)state.showSign=true;}).catch(error=>{state.error=cloudError(error);}).finally(()=>{state.loading=false;render();});}

function header(title,sub){const top=safeTop+8;text("‹",23,top+19,32,"#ddd6ff","center");hit("home",0,top-5,48,48);text(title,50,top+15,23,"#f3edff","left",800);text(sub,50,top+39,10,"#aab0d1");return top+55;}
function scrollBar(top){if(state.maxScroll<=0)return;const view=H-top-safeBottom,track=view-12,thumb=Math.max(28,track*view/(view+state.maxScroll)),y=top+6+(track-thumb)*state.scrollY/state.maxScroll;box(W-5,y,2,thumb,1,"#aaa1d088");}

function renderHome(){bg();const m=16,top=homeContentTop();text("ASTRAL SUMMON · 星界秘仪",m,top+10,9,"#aa9fff");text("星界召唤",m,top+38,28,"#f5efff","left",800);text(`云端账号 · ${state.userKey||"连接中"}`,m,top+61,9,state.error?"#ef9191":"#79c7a6");
  if(!state.configReady&&!state.loading){button("retry",m,top+70,150,30,"云配置加载失败 · 重试","",true);}
  const stats=[[state.player.ticket,"抽卡券"],[state.player.coin,"金币"],[state.player.totalDraws,"累计召唤"],[state.player.dust,"星尘"]],sw=46,g=4,sx=W-m-sw*4-g*3;stats.forEach((item,i)=>{box(sx+i*(sw+g),top+2,sw,48,9,"#1b2040","#47447c");text(item[0],sx+i*(sw+g)+sw/2,top+19,12,i===0?"#8fe7c1":"#f1d58a","center",700);text(item[1],sx+i*(sw+g)+sw/2,top+36,7,"#9da4c8","center");});
  let y=top+76;text("选择召唤卡池 · 左右滑动",m,y,14,"#ebe5ff","left",700);y+=13;const pw=Math.min(230,W*.66),poolGap=8,totalPoolWidth=state.pools.length*pw+Math.max(0,state.pools.length-1)*poolGap;state.maxPoolScroll=Math.max(0,totalPoolWidth-(W-m*2));state.poolScrollX=Math.max(0,Math.min(state.poolScrollX,state.maxPoolScroll));state.poolArea={x:m,y,w:W-m*2,h:78};ctx.save();ctx.beginPath();ctx.rect(m,y,W-m*2,78);ctx.clip();state.pools.forEach((pool,i)=>{const x=m+i*(pw+poolGap)-state.poolScrollX,selected=state.selectedPoolId===pool.id;box(x,y,pw,78,12,selected?gradient(y,78,"#6655a9","#24274c"):"#171d39",selected?"#e2c67d":"#414c78");text(pool.name,x+pw/2,y+24,14,"#fff","center",700);const names=pool.setIds.map(id=>(state.sets.find(set=>set.id===id)||{}).name).filter(Boolean).join(" + ");text(fit(names,pw-16,10),x+pw/2,y+49,10,"#b4b9d6","center");if(selected)text("已选择",x+pw/2,y+66,9,"#f0d58b","center");hit("selectPool",x,y,pw,78,pool.id);});ctx.restore();
  y+=92;const ready=Boolean(state.selectedPoolId)&&!state.loading;const bw=(W-m*2-12)/3;[[1,"单抽"],[5,"五连"],[10,"十连"]].forEach((item,i)=>button("draw",m+i*(bw+6),y,bw,58,item[1],state.player.ticket>=item[0]?`消耗 ${item[0]}`:"抽卡券不足",ready&&state.player.ticket>=item[0],item[0]));
  y+=70;const nw=(W-m*2-12)/4;[["sign","每日签到"],["history","召唤记录"],["collection","卡牌图鉴"],["forge","卡牌工坊"]].forEach((item,i)=>{button(item[0],m+i*(nw+4),y,nw,45,item[1],"",!state.loading&&state.configReady);if(item[0]==="sign"&&state.signStatus&&!state.signStatus.claimedToday){ctx.fillStyle="#ff566d";ctx.beginPath();ctx.arc(m+i*(nw+4)+nw-6,y+6,5,0,Math.PI*2);ctx.fill();}});
  y+=51;[["shop","商店"],["mail","邮箱"],["tasks","每日任务"],["achievements","成就"]].forEach((item,i)=>{button(item[0],m+i*(nw+4),y,nw,45,item[1],"",!state.loading&&state.configReady);const dot=item[0]==="mail"?state.redDots.mail:item[0]==="tasks"?state.redDots.tasks:item[0]==="achievements"?state.redDots.achievements:false;if(dot){ctx.fillStyle="#ff566d";ctx.beginPath();ctx.arc(m+i*(nw+4)+nw-6,y+6,5,0,Math.PI*2);ctx.fill();}});
  y+=56;text(state.selectedPoolId?`当前：${(state.pools.find(p=>p.id===state.selectedPoolId)||{}).name}`:"请先点击选择卡池",W/2,y,11,state.selectedPoolId?"#e5d18c":"#e58d8d","center");text("重置云端存档（开发阶段）",W/2,H-safeBottom-15,10,"#747c9f","center");hit("reset",W/2-80,H-safeBottom-30,160,28);
}

function rewardsLabel(rewards){return(rewards||[]).map(reward=>{if(reward.type==="coin")return`${reward.amount}金币`;if(reward.type==="ticket")return`${reward.amount}券`;if(reward.type==="dust")return`${reward.amount}星尘`;if(reward.type==="randomCard")return`随机${RARITY_LABEL[reward.rarity]}卡×${reward.amount||1}`;if(reward.type==="card")return`${reward.name||reward.cardId}×${reward.amount||1}`;return reward.type;}).join(" · ");}
function drawRedDot(x,y){ctx.fillStyle="#ff566d";ctx.beginPath();ctx.arc(x,y,5,0,Math.PI*2);ctx.fill();}
function renderShop(){bg("#30265a","#090d1c");const top=header("星界商店",`金币 ${state.player.coin} · 抽卡券 ${state.player.ticket}`),m=16;box(m,top+18,W-m*2,190,15,gradient(top+18,190,"#2b315d","#151b38"),"#6c63a5");text("抽卡券",W/2,top+53,24,"#f4edff","center",800);text("每张可进行 1 次召唤",W/2,top+82,11,"#aeb5d2","center");text(`${state.shop.ticketPrice||100} 金币 / 张`,W/2,top+116,18,"#f1d082","center",700);button("buyTicket",m+24,top+148,W-m*2-48,44,"选择购买数量","1 / 5 / 10 / 自定义（上限99）",true);text("金币与抽卡券均由云端结算",W/2,top+235,10,"#858dad","center");}
function renderMail(){bg("#242653","#090d1c");const top=header("星界邮箱",`${state.mail.length} 封可领取邮件`),m=12,row=126,gap=8;button("claimAllMail",W-116,top-48,104,32,"一键领取","",state.mail.length>0);state.maxScroll=Math.max(0,state.mail.length*(row+gap)-(H-top-safeBottom));ctx.save();ctx.beginPath();ctx.rect(0,top,W,H-top-safeBottom);ctx.clip();state.mail.forEach((mail,i)=>{const y=top+i*(row+gap)-state.scrollY;if(y+row<top||y>H)return;box(m,y,W-m*2,row,11,"#171e3d","#4d5684");text(mail.title,m+14,y+20,14,"#fff","left",700);const days=Math.max(0,Math.ceil((mail.expiresAt-Date.now())/86400000));text(`${new Date(mail.publishedAt).toLocaleDateString()} · 剩余${days}天`,W-m-14,y+20,9,"#929abd","right");text(fit(mail.body||"系统奖励",W-m*2-28,10),m+14,y+45,10,"#b8bed8");text(fit(rewardsLabel(mail.rewards),W-m*2-110,10),m+14,y+76,10,"#efd181");button("claimMail",W-m-94,y+66,80,38,"领取","",true,mail.id);});ctx.restore();if(!state.mail.length)text("暂时没有可领取邮件",W/2,top+90,13,"#959dbd","center");scrollBar(top);}
function taskProgress(item){return`${Math.min(item.progress||0,item.target)} / ${item.target}`;}
function renderTasks(){bg("#292557","#090d1c");const top=header("每日与每周任务","按北京时间刷新"),m=12;button("claimAllTasks",W-106,top-48,94,30,"一键领取","",true,state.taskTab);const tabW=(W-m*2-6)/2;button("taskTab",m,top,tabW,34,"每日任务","",state.taskTab!=="daily","daily");button("taskTab",m+tabW+6,top,tabW,34,"每周任务","",state.taskTab!=="weekly","weekly");const data=state.tasks[state.taskTab]||{tasks:[],bonus:null},items=[...data.tasks,...(data.bonus?[{...data.bonus,bonus:true}]:[])],start=top+44,row=91,gap=7;state.maxScroll=Math.max(0,items.length*(row+gap)-(H-start-safeBottom));ctx.save();ctx.beginPath();ctx.rect(0,start,W,H-start-safeBottom);ctx.clip();items.forEach((item,i)=>{const y=start+i*(row+gap)-state.scrollY;if(y+row<start||y>H)return;box(m,y,W-m*2,row,10,item.bonus?"#302653":"#171e3c",item.completed?"#d2b968":"#4c557e");text(item.name,m+13,y+18,13,"#fff","left",700);text(item.description,m+13,y+39,9,"#aeb5d2");text(item.bonus?(item.completed?"已完成":"完成全部普通任务"):taskProgress(item),m+13,y+63,10,item.completed?"#edd17e":"#97a0c2");text(fit(rewardsLabel(item.rewards),W-m*2-125,9),m+13,y+79,9,"#d2bb76");button("claimTask",W-m-94,y+27,80,38,item.claimed?"已领取":item.completed?"领取":"未完成","",item.completed&&!item.claimed,{scope:state.taskTab,taskId:item.id,bonus:Boolean(item.bonus)});});ctx.restore();scrollBar(start);}
function renderAchievements(){bg("#33265b","#090d1c");const top=header("星界成就","分阶段领取，每个阶段独立奖励"),m=12,row=98,gap=7,items=state.tasks.achievements||[];button("claimAllTasks",W-106,top-48,94,30,"一键领取","",true,"achievement");state.maxScroll=Math.max(0,items.length*(row+gap)-(H-top-safeBottom));ctx.save();ctx.beginPath();ctx.rect(0,top,W,H-top-safeBottom);ctx.clip();items.forEach((item,i)=>{const y=top+i*(row+gap)-state.scrollY;if(y+row<top||y>H)return;box(m,y,W-m*2,row,10,"#191e3d",item.completed?"#d3ba69":"#505983");text(item.name,m+13,y+19,13,"#fff","left",700);text(item.description,m+13,y+42,9,"#aeb5d2");text(taskProgress(item),m+13,y+66,10,item.completed?"#efd27e":"#9ca5c5");text(fit(rewardsLabel(item.rewards),W-m*2-125,9),m+13,y+83,9,"#d6be79");button("claimTask",W-m-94,y+31,80,38,item.claimed?"已领取":item.completed?"领取":"未完成","",item.completed&&!item.claimed,{scope:"achievement",taskId:item.id,bonus:false});});ctx.restore();if(!items.length)text("暂无可显示成就",W/2,top+80,12,"#959dbd","center");scrollBar(top);}

function miniCard(item,x,y,w,h){const card=item.card||item,p=COLORS[card.rarity]||COLORS.common;box(x,y,w,h,7,gradient(y,h,p.fill,"#10162b"),p.border);text(card.element,x+w/2,y+h*.24,Math.min(28,w*.42),p.accent,"center");text(fit(card.name,w-8,Math.max(8,w*.13)),x+w/2,y+h*.49,Math.max(8,w*.13),"#fff","center",700);text(`⚔${card.attack}  ♥${card.health}`,x+w/2,y+h*.68,Math.max(8,w*.12),"#fff","center");text(RARITY_LABEL[card.rarity],x+w/2,y+h*.84,Math.max(7,w*.1),p.accent,"center");}
function renderResults(){ctx.fillStyle="#050712ee";ctx.fillRect(0,0,W,H);const m=14,py=safeTop+10,ph=H-py-safeBottom-10;box(m,py,W-m*2,ph,16,gradient(py,ph,"#242850","#0d1329"),"#6d5aac");text(state.resultLabel,m+18,py+30,19,"#f1e7ff","left",700);text("×",W-m-22,py+30,28,"#aeb5da","center");hit("closeResults",W-m-48,py,48,50);const count=state.results.length,cols=count===1?1:5,rows=Math.ceil(count/cols),gap=5,maxW=count===1?170:W-m*2-24,cw=count===1?maxW:(maxW-gap*(cols-1))/cols,ch=count===1?250:Math.min(cw*1.7,(ph-130-gap*(rows-1))/rows),gw=cols*cw+gap*(cols-1),gx=(W-gw)/2,gy=py+58;state.results.forEach((item,i)=>miniCard(item,gx+(i%cols)*(cw+gap),gy+Math.floor(i/cols)*(ch+gap),cw,ch));button("closeResults",m+16,py+ph-46,W-m*2-32,34,"收下卡牌","",true);}

function filteredCards(){return state.cards.filter(card=>state.collectionFilter==="all"||card.set===state.collectionFilter);}
function renderCollection(){bg();const cards=filteredCards(),owned=cards.filter(card=>{const e=inventory(card.id);return e.normalCount+e.shinyCount>0;}).length,top=header("星界卡牌图鉴",`已收集 ${owned} / ${cards.length} 种`),m=12;let fy=top;const filters=[{id:"all",name:"全部"},...state.sets];const fw=(W-m*2-(filters.length-1)*5)/filters.length;filters.forEach((f,i)=>{button("filter",m+i*(fw+5),fy,fw,32,f.name,"",true,f.id);});const start=fy+42,cols=W>=430?4:3,gap=7,cw=(W-m*2-gap*(cols-1))/cols,ch=cw*1.58,rows=Math.ceil(cards.length/cols);state.maxScroll=Math.max(0,rows*(ch+gap)-(H-start-safeBottom));ctx.save();ctx.beginPath();ctx.rect(0,start,W,H-start-safeBottom);ctx.clip();cards.forEach((card,i)=>{const e=inventory(card.id),has=e.normalCount+e.shinyCount>0,x=m+(i%cols)*(cw+gap),y=start+Math.floor(i/cols)*(ch+gap)-state.scrollY;if(y+ch<start||y>H)return;ctx.globalAlpha=has?1:.45;miniCard(card,x,y,cw,ch);text(`${e.normalCount} / 闪 ${e.shinyCount}`,x+cw/2,y+ch-9,8,"#ddd","center");text((state.sets.find(s=>s.id===card.set)||{}).name||card.set,x+cw/2,y+ch-22,8,"#b4b9d6","center");ctx.globalAlpha=1;});ctx.restore();scrollBar(start);}

function renderForge(){bg("#342050","#090d1c");const top=header("卡牌工坊",`星尘 ${state.player.dust} · 所有卡包通用`),m=12,row=96,gap=8;state.maxScroll=Math.max(0,state.cards.length*(row+gap)-(H-top-safeBottom));ctx.save();ctx.beginPath();ctx.rect(0,top,W,H-top-safeBottom);ctx.clip();state.cards.forEach((card,i)=>{const e=inventory(card.id),has=e.normalCount+e.shinyCount>0,y=top+i*(row+gap)-state.scrollY;if(y+row<top||y>H)return;const p=COLORS[card.rarity];box(m,y,W-m*2,row,11,gradient(y,row,has?"#252d4e":"#1b2138","#11172b"),has?p.border:"#4c5677");text(has?card.element:"?",m+34,y+34,29,has?p.accent:"#8992ad","center");text(card.name,m+65,y+18,13,"#fff","left",700);text(`${RARITY_LABEL[card.rarity]} · 普通 ${e.normalCount} · 闪耀 ${e.shinyCount}`,m+65,y+38,9,"#b8bed8");const dis=state.config.disassemble[card.rarity],cost=state.config.craft[card.rarity];text(has?`分解 +${dis} 星尘`:`制作 ${cost} 星尘`,m+65,y+57,9,"#e3c782");button("workshop",W-m-126,y+23,56,36,"分解",`${dis}`,e.normalCount>0&&!state.loading,{action:"disassemble",cardId:card.id});button("workshop",W-m-64,y+23,54,36,has?"闪耀":"制作",has?"3张":`${cost}`,(has?e.normalCount>=3:state.player.dust>=cost)&&!state.loading,{action:has?"shiny":"craft",cardId:card.id});});ctx.restore();scrollBar(top);}

function rewardLabel(reward){if(!reward)return"";return reward.type==="ticket"?`${reward.amount} 抽卡券`:`随机${RARITY_LABEL[reward.rarity]}卡 ×1`;}
function renderSign(){
  ctx.fillStyle="#050712ee";
  ctx.fillRect(0,0,W,H);
  const layout=SIGN_LAYOUT,m=layout.margin,y=safeTop+layout.topOffset;
  const rewards=state.config.signIn.firstCycle;
  const rewardListHeight=rewards.length*layout.rewardRowHeight+(rewards.length-1)*layout.rewardGap;
  const firstCycleHeight=layout.headerHeight+rewardListHeight+layout.actionGap+layout.actionHeight+layout.footerHeight+layout.bottomPadding;
  const completedHeight=300;
  const h=state.signStatus.firstCycle?firstCycleHeight:completedHeight;
  box(m,y,W-m*2,h,17,gradient(y,h,"#302759","#11162d"),"#7d69bc");
  text("七日签到",W/2,y+35,24,"#f4ecff","center",800);
  text("按北京时间自然日刷新",W/2,y+60,10,"#aeb4d2","center");
  if(state.signStatus.firstCycle){
    const start=y+layout.headerHeight,row=layout.rewardRowHeight;
    rewards.forEach((reward,i)=>{
      const done=i<state.player.signIn.firstCycleDay,current=i===state.player.signIn.firstCycleDay;
      const rowY=start+i*(row+layout.rewardGap);
      box(m+15,rowY,W-m*2-30,row,9,current?"#4e417a":done?"#263047":"#1c2139",current?"#e4c878":"#424c6c");
      text(`Day ${i+1}`,m+28,rowY+row/2,12,done?"#7f89a6":"#fff","left",700);
      text(rewardLabel(reward),W-m-28,rowY+row/2,11,current?"#f0d68b":"#b8bed8","right");
    });
  }else{
    text("首轮七日奖励已完成",W/2,y+115,18,"#eee7ff","center",700);
    text("今后每日固定领取 5 抽卡券",W/2,y+155,13,"#d9c382","center");
  }
  const buttonY=y+h-layout.footerHeight-layout.bottomPadding-layout.actionHeight;
  button("claimSign",m+18,buttonY,W-m*2-36,layout.actionHeight,state.signStatus.claimedToday?"今日已签到":"领取签到奖励","",!state.signStatus.claimedToday&&!state.loading);
  text("点击面板外空白处关闭",W/2,y+h-layout.bottomPadding-9,10,"#858dac","center");
  hit("closeSign",0,0,W,y);
  hit("closeSign",0,y+h,W,H-y-h);
  hit("closeSign",0,y,m,h);
  hit("closeSign",W-m,y,m,h);
}

function renderHistory(){bg("#20234b","#090d1c");const top=header("召唤记录","最近 100 批 · 云端最多保存 2000 批"),m=12,row=66;let content=0;state.history.forEach(item=>content+=row+(state.expandedHistory===item._id?Math.ceil(item.results.length/5)*56+10:0));state.maxScroll=Math.max(0,content-(H-top-safeBottom));ctx.save();ctx.beginPath();ctx.rect(0,top,W,H-top-safeBottom);ctx.clip();let y=top-state.scrollY;state.history.forEach(item=>{const expanded=state.expandedHistory===item._id,h=row+(expanded?Math.ceil(item.results.length/5)*56+10:0);box(m,y,W-m*2,h,10,"#171d39","#444e78");text(item.poolName||"签到奖励",m+12,y+19,13,"#fff","left",700);text(`${item.drawType} · 最高 ${RARITY_LABEL[item.highestRarity]}`,m+12,y+42,10,"#b5bbd7");text(new Date(item.createdAt).toLocaleString(),W-m-12,y+19,9,"#8e96ba","right");hit("expandHistory",m,y,W-m*2,row,item._id);if(expanded)item.results.forEach((r,i)=>{const x=m+12+(i%5)*((W-m*2-24)/5),cy=y+row+Math.floor(i/5)*56;text(r.element,x+20,cy+15,19,COLORS[r.rarity].accent,"center");text(fit(r.name,54,8),x+20,cy+37,8,"#ddd","center");if(r.pityTriggered||r.tenGuarantee)text(r.pityTriggered?"40保底":"十连保底",x+20,cy+50,7,"#f0cd78","center");});y+=h+7;});ctx.restore();scrollBar(top);}

function render(){state.hit=[];state.player=state.player||emptyPlayer();if(state.screen==="collection")renderCollection();else if(state.screen==="forge")renderForge();else if(state.screen==="history")renderHistory();else if(state.screen==="shop")renderShop();else if(state.screen==="mail")renderMail();else if(state.screen==="tasks")renderTasks();else if(state.screen==="achievements")renderAchievements();else renderHome();if(state.showResults)renderResults();if(state.showSign)renderSign();if(state.loading){ctx.fillStyle="#05071388";ctx.fillRect(0,0,W,H);text("云端处理中…",W/2,H/2,18,"#fff","center",700);}if(state.error&&!state.loading)text(fit(state.error,W-30,9),W/2,H-safeBottom-36,9,"#ef9191","center");}

function switchScreen(screen){state.screen=screen;state.scrollY=0;state.maxScroll=0;render();}
function doDraw(count){if(!state.selectedPoolId){wx.showToast({title:"请先选择卡池",icon:"none"});return;}call(api.drawCards(state.selectedPoolId,count),result=>{state.results=result.results;state.resultLabel=result.batch.drawType;state.showResults=true;});}
function doWorkshop(data){if(data.action==="disassemble"){const card=state.cards.find(c=>c.id===data.cardId);wx.showModal({title:"分解普通卡",content:`分解 1 张「${card.name}」？`,success:r=>{if(r.confirm)call(api.workshopAction(data.action,data.cardId),()=>wx.showToast({title:"分解成功",icon:"success"}));}});}else call(api.workshopAction(data.action,data.cardId),()=>wx.showToast({title:data.action==="craft"?"制作成功":"闪耀合成成功",icon:"success"}));}
function claimSign(){call(api.claimSignIn(),result=>{state.signStatus=result.status;wx.showToast({title:result.card?`获得 ${result.card.name}`:`获得 ${result.reward.amount} 抽卡券`,icon:"success"});});}
function loadHistory(){call(api.loadDrawHistory(),result=>{state.history=result.history;switchScreen("history");});}
function choosePurchase(){wx.showActionSheet({itemList:["购买 1 张","购买 5 张","购买 10 张","自定义数量"],success:result=>{if(result.tapIndex<3)return confirmPurchase([1,5,10][result.tapIndex]);wx.showModal({title:"自定义购买",editable:true,placeholderText:"请输入 1-99",success:modal=>{if(modal.confirm)confirmPurchase(Number(modal.content));}});}});}
function confirmPurchase(quantity){const count=Math.floor(Number(quantity));if(count<1||count>99){wx.showToast({title:"请输入 1-99",icon:"none"});return;}const cost=count*(state.shop.ticketPrice||100);wx.showModal({title:"购买抽卡券",content:`消耗 ${cost} 金币购买 ${count} 张抽卡券？`,success:result=>{if(result.confirm)call(api.buyTickets(count),()=>wx.showToast({title:"购买成功",icon:"success"}));}});}
function claimOneMail(mailId){call(api.claimMail(mailId),()=>wx.showToast({title:"领取成功",icon:"success"}));}
function claimEveryMail(){if(!state.mail.length)return;call(api.claimAllMail(state.mail.map(item=>item.id)),result=>wx.showToast({title:`领取 ${result.granted.length} 封`,icon:"success"}));}
function claimTaskReward(data){call(api.claimTask(data.scope,data.taskId,data.bonus),()=>wx.showToast({title:"奖励已领取",icon:"success"}));}
function claimAllTaskRewards(scope){call(api.claimAllTasks(scope),result=>wx.showToast({title:`领取 ${result.claimed.length} 项`,icon:"success"}));}
function resetGame(){wx.showModal({title:"重置云端存档",content:"开发功能：恢复为全新账号状态并清空记录？",success:r=>{if(r.confirm)call(api.resetGameData(),result=>{state.player=result.player;state.signStatus={claimedToday:false,firstCycle:true,day:1,reward:state.config.signIn.firstCycle[0]};state.selectedPoolId="";wx.showToast({title:"已重置",icon:"success"});});}});}

function activate(x,y){const target=[...state.hit].reverse().find(a=>x>=a.x&&x<=a.x+a.w&&y>=a.y&&y<=a.y+a.h);if(!target||state.loading)return;const{id,data}=target;if(id==="retry"){refresh(false);return;}if(!state.configReady&&!["home"].includes(id)){wx.showToast({title:"云配置未就绪",icon:"none"});return;}if(id==="selectPool")state.selectedPoolId=data;else if(id==="draw")doDraw(data);else if(id==="sign")state.showSign=true;else if(id==="history")loadHistory();else if(id==="collection")switchScreen("collection");else if(id==="forge")switchScreen("forge");else if(id==="shop")switchScreen("shop");else if(id==="mail")switchScreen("mail");else if(id==="tasks")switchScreen("tasks");else if(id==="achievements")switchScreen("achievements");else if(id==="buyTicket")choosePurchase();else if(id==="claimMail")claimOneMail(data);else if(id==="claimAllMail")claimEveryMail();else if(id==="claimTask")claimTaskReward(data);else if(id==="claimAllTasks")claimAllTaskRewards(data);else if(id==="taskTab"){state.taskTab=data;state.scrollY=0;}else if(id==="home")switchScreen("home");else if(id==="filter"){state.collectionFilter=data;state.scrollY=0;}else if(id==="workshop")doWorkshop(data);else if(id==="claimSign")claimSign();else if(id==="closeSign")state.showSign=false;else if(id==="closeResults"){state.showResults=false;state.results=[];}else if(id==="expandHistory")state.expandedHistory=state.expandedHistory===data?"":data;else if(id==="reset")resetGame();render();}

wx.onTouchStart(e=>{const t=e.touches&&e.touches[0];if(!t)return;state.touchX=t.clientX;state.touchY=t.clientY;state.lastX=t.clientX;state.lastY=t.clientY;state.moved=false;});
wx.onTouchMove(e=>{if(state.showSign||state.showResults)return;const t=e.touches&&e.touches[0];if(!t)return;if(state.screen==="home"&&state.poolArea&&state.touchY>=state.poolArea.y&&state.touchY<=state.poolArea.y+state.poolArea.h){const dx=t.clientX-state.lastX;if(Math.abs(t.clientX-state.touchX)>6)state.moved=true;state.poolScrollX=Math.max(0,Math.min(state.maxPoolScroll,state.poolScrollX-dx));state.lastX=t.clientX;render();return;}if(!["collection","forge","history","mail","tasks","achievements"].includes(state.screen))return;const d=t.clientY-state.lastY;if(Math.abs(t.clientY-state.touchY)>6)state.moved=true;state.scrollY=Math.max(0,Math.min(state.maxScroll,state.scrollY-d));state.lastY=t.clientY;render();});
wx.onTouchEnd(e=>{if(state.moved)return;const t=e.changedTouches&&e.changedTouches[0];if(t)activate(t.clientX,t.clientY);});
wx.onShow(()=>{if(state.hasLoaded&&!state.loading)refresh(true);});
render();refresh(true);
