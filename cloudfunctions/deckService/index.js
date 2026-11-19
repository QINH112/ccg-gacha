"use strict";

const cloud=require("wx-server-sdk");
cloud.init({env:cloud.DYNAMIC_CURRENT_ENV});
const db=cloud.database();

const RARITY_LIMIT={common:3,rare:2,epic:2,legendary:1};
const SKILLS=new Set(["draw-two","heal-five"]);

function number(value){return Math.max(0,Math.floor(Number(value||0)));}
async function all(name){const output=[];for(let skip=0;;skip+=100){const page=await db.collection(name).skip(skip).limit(100).get();output.push(...page.data);if(page.data.length<100)break;}return output;}
function emptySlot(slot){return{slot,name:`牌组 ${slot}`,generalSkill:"draw-two",cards:[],complete:false,valid:false,errors:[],updatedAt:0};}
function normalizeDeck(raw,slot){const source=raw||{},merged=new Map();for(const item of Array.isArray(source.cards)?source.cards:[]){const cardId=String(item.cardId||"");if(!cardId)continue;const old=merged.get(cardId)||{cardId,normalCount:0,shinyCount:0};old.normalCount+=number(item.normalCount);old.shinyCount+=number(item.shinyCount);merged.set(cardId,old);}return{slot,name:String(source.name||`牌组 ${slot}`).slice(0,12),generalSkill:SKILLS.has(source.generalSkill)?source.generalSkill:"draw-two",cards:[...merged.values()].filter(item=>item.normalCount+item.shinyCount>0),updatedAt:number(source.updatedAt)};}
function inventoryMap(player){return new Map((Array.isArray(player.inventory)?player.inventory:[]).map(item=>[String(item.cardId),{normalCount:number(item.normalCount),shinyCount:number(item.shinyCount)}]));}
function validate(deck,player,cards){const cardMap=new Map(cards.map(card=>[String(card.id),card])),owned=inventoryMap(player),errors=[];let count=0;for(const item of deck.cards){const card=cardMap.get(item.cardId),quantity=item.normalCount+item.shinyCount;count+=quantity;if(!card){errors.push(`${item.cardId} 不存在`);continue;}if(card.playable===false)errors.push(`${card.name} 暂不可用`);const limit=RARITY_LIMIT[card.rarity]||1;if(quantity>limit)errors.push(`${card.name} 最多可放 ${limit} 张`);const have=owned.get(item.cardId)||{normalCount:0,shinyCount:0};if(item.normalCount>have.normalCount||item.shinyCount>have.shinyCount)errors.push(`${card.name} 超出拥有数量`);}if(count!==20)errors.push(`牌组需要 20 张，当前 ${count} 张`);return{...deck,count,complete:count===20,valid:errors.length===0,errors};}
async function player(openid){try{return(await db.collection("gameSaves").doc(openid).get()).data;}catch(error){throw new Error("玩家存档不存在");}}
async function list(openid){const [rawPlayer,cards]=await Promise.all([player(openid),all("cards")]);let saved={};try{saved=(await db.collection("playerDecks").doc(openid).get()).data.slots||{};}catch(error){}const slots=[];for(let slot=1;slot<=5;slot++)slots.push(validate(normalizeDeck(saved[String(slot)]||emptySlot(slot),slot),rawPlayer,cards));return{slots};}
async function save(openid,event){const slot=Math.floor(Number(event.slot));if(slot<1||slot>5)throw new Error("牌组槽位无效");const [rawPlayer,cards]=await Promise.all([player(openid),all("cards")]);const deck=validate(normalizeDeck(event.deck,slot),rawPlayer,cards);let old={};try{old=(await db.collection("playerDecks").doc(openid).get()).data;}catch(error){}const slots={...(old.slots||{}),[String(slot)]:{slot:deck.slot,name:deck.name,generalSkill:deck.generalSkill,cards:deck.cards,updatedAt:Date.now()}};await db.collection("playerDecks").doc(openid).set({data:{userId:openid,slots,updatedAt:Date.now()}});return{deck};}
async function clear(openid,event){const slot=Math.floor(Number(event.slot));if(slot<1||slot>5)throw new Error("牌组槽位无效");let old={};try{old=(await db.collection("playerDecks").doc(openid).get()).data;}catch(error){}const slots={...(old.slots||{}),[String(slot)]:emptySlot(slot)};await db.collection("playerDecks").doc(openid).set({data:{userId:openid,slots,updatedAt:Date.now()}});return{deck:emptySlot(slot)};}

exports.main=async event=>{const{OPENID}=cloud.getWXContext();if(!OPENID)throw new Error("无法获取当前微信用户 OPENID");const action=String(event&&event.action||"list");if(action==="list")return list(OPENID);if(action==="save")return save(OPENID,event||{});if(action==="clear")return clear(OPENID,event||{});throw new Error("牌组操作无效");};
