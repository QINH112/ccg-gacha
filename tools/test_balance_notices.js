"use strict";

const assert = require("assert");
const Module = require("module");

const stores = new Map();
let currentOpenid = "balance-test-user";
let failBalanceCollection = false;

function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
function records(name) { if (!stores.has(name)) stores.set(name, new Map()); return stores.get(name); }
function reference(name, id) {
  return {
    async get() { const value=records(name).get(String(id)); if(!value)throw new Error("document not found"); return {data:{...clone(value),_id:String(id)}}; },
    async set({data}) { records(name).set(String(id),clone(data)); return {}; },
    async remove() { records(name).delete(String(id)); return {}; }
  };
}
function query(name, skip=0, limit=100) {
  return {
    skip(value){return query(name,value,limit);},
    limit(value){return query(name,skip,value);},
    async get(){return{data:[...records(name)].slice(skip,skip+limit).map(([id,value])=>({...clone(value),_id:id}))};}
  };
}
function collection(name){if(name==="balanceNotices"&&failBalanceCollection)throw new Error("collection unavailable");return{doc:id=>reference(name,id),skip:value=>query(name,value),limit:value=>query(name,0,value)};}
const database={collection,serverDate:()=>Date.now(),runTransaction:async callback=>callback({collection})};

const originalLoad=Module._load;
Module._load=function(request,parent,isMain){if(request==="wx-server-sdk")return{init(){},DYNAMIC_CURRENT_ENV:"test",database:()=>database,getWXContext:()=>({OPENID:currentOpenid})};return originalLoad(request,parent,isMain);};

process.env.INIT_SECRET="balance-test-secret";
const gameData=require("../cloudfunctions/gameData/index.js");
const adminModule=require("../cloudfunctions/adminGame/index.js");
const admin=adminModule.__test;

function notice(id,publishedAt,enabled=true){return{id,title:id,summary:"公告",version:1,publishedAt,enabled,changes:[{cardId:"c001",name:"星尘学徒",before:{cost:1,attack:1,health:2,keywords:[],rulesText:""},after:{cost:1,attack:1,health:3,keywords:[],rulesText:""},note:"生命提高"}]};}

(async()=>{
  const cleaned=admin.cleanBalanceNotice({id:"new",title:"新公告",publishedAt:300,changes:notice("x",1).changes});
  assert.equal(cleaned.id,"new");
  assert.equal(cleaned.changes[0].after.health,3);
  const cleanedInvalidNumbers=admin.cleanBalanceNotice({id:"invalid",version:"bad",publishedAt:"bad",changes:[{cardId:"c001",name:"星尘学徒",before:{cost:"bad",attack:"bad",health:"bad"},after:{cost:1,attack:1,health:3}}]});
  assert.equal(cleanedInvalidNumbers.version,1);
  assert.equal(Number.isFinite(cleanedInvalidNumbers.publishedAt),true);
  assert.deepEqual([cleanedInvalidNumbers.changes[0].before.cost,cleanedInvalidNumbers.changes[0].before.attack,cleanedInvalidNumbers.changes[0].before.health],[0,0,0]);
  const cleanedSpell=admin.cleanBalanceNotice({id:"spell",changes:[{cardId:"l004",name:"万籁归寂",before:{cost:1,attack:null,health:null},after:{cost:2,attack:null,health:null}}]});
  assert.deepEqual([cleanedSpell.changes[0].before.attack,cleanedSpell.changes[0].before.health],[null,null]);
  assert.throws(()=>admin.cleanBalanceChanges([]),/至少需要一张卡牌/);

  records("cards").set("c001",{id:"c001",rarity:"common"});
  records("gameConfig").set("main",{craft:{common:40}});
  const published=await adminModule.main({action:"upsertBalanceNotice",secret:"balance-test-secret",data:{id:"immutable",title:"不可覆盖公告",publishedAt:250,changes:notice("x",1).changes}});
  assert.equal(published.notice.id,"immutable");
  await assert.rejects(()=>adminModule.main({action:"upsertBalanceNotice",secret:"balance-test-secret",data:{id:"immutable",title:"尝试覆盖",publishedAt:251,changes:notice("x",1).changes}}),/已发布公告不可覆盖/);
  await adminModule.main({action:"disableBalanceNotice",secret:"balance-test-secret",id:"immutable"});
  assert.equal(records("balanceNotices").get("immutable").enabled,false);
  await adminModule.main({action:"enableBalanceNotice",secret:"balance-test-secret",id:"immutable"});
  assert.equal(records("balanceNotices").get("immutable").enabled,true);
  await assert.rejects(()=>adminModule.main({action:"upsertBalanceNotice",secret:"balance-test-secret",data:{title:"缺少 ID",changes:notice("x",1).changes}}),/缺少调整公告 ID/);
  records("balanceNotices").clear();

  records("balanceNotices").set("older",notice("older",100));
  records("balanceNotices").set("latest-b",notice("latest-b",200));
  records("balanceNotices").set("latest-a",notice("latest-a",200));
  records("balanceNotices").set("disabled",notice("disabled",999,false));
  const result=await gameData.__test.balanceNotices();
  assert.equal(result.status,"ready");
  assert.deepEqual(result.items.map(item=>item.id),["latest-b","latest-a","older"]);
  assert.equal(result.latest.id,"latest-b");
  assert.equal(result.items.some(item=>item.id==="disabled"),false);

  records("balanceNotices").clear();
  records("balanceNotices").set("only-disabled",notice("only-disabled",500,false));
  const empty=await gameData.__test.balanceNotices();
  assert.equal(empty.status,"ready");
  assert.equal(empty.latest,null);
  assert.deepEqual(empty.items,[]);

  failBalanceCollection=true;
  const failed=await gameData.__test.balanceNotices();
  failBalanceCollection=false;
  assert.equal(failed.status,"error");
  assert.equal(failed.latest,null);

  const unsafe=gameData.__test.safeNotice({id:"unsafe",title:"x".repeat(80),publishedAt:1,changes:[{cardId:"c001",name:"卡",before:{cost:-2,attack:-1,health:-1,keywords:["guard","bad"],rulesText:"a".repeat(300)},after:{cost:1,attack:1,health:3,keywords:[]}}]});
  assert.equal(unsafe.title.length,40);
  assert.equal(unsafe.summary.length,0);
  assert.deepEqual(unsafe.changes[0].before.keywords,["guard"]);
  assert.equal(unsafe.changes[0].before.rulesText.length,240);
  assert.equal(unsafe.changes[0].before.health,0);
  const invalidNumber=gameData.__test.safeNotice({id:"invalid-number",changes:[{cardId:"c001",name:"卡",before:{cost:"bad",attack:"bad",health:"bad"},after:{cost:1,attack:1,health:1}}]});
  assert.deepEqual([invalidNumber.changes[0].before.cost,invalidNumber.changes[0].before.attack,invalidNumber.changes[0].before.health],[0,0,0]);
  const safeSpell=gameData.__test.safeNotice({id:"spell",changes:[{cardId:"l004",name:"万籁归寂",before:{cost:1,attack:null,health:null},after:{cost:2,attack:null,health:null}}]});
  assert.deepEqual([safeSpell.changes[0].before.attack,safeSpell.changes[0].before.health],[null,null]);

  console.log("balance notice tests passed: immutable publishing, state toggles, filtering, stable ordering, sanitization");
})().catch(error=>{console.error(error);process.exitCode=1;});
