"use strict";

const assert = require("assert");
const Module = require("module");

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === "wx-server-sdk") {
    const collection = () => ({
      doc:() => ({ get:async()=>({data:{}}), set:async()=>({}) }),
      where:() => ({ orderBy:() => ({ limit:async()=>({data:[]}) }) })
    });
    return { init(){}, DYNAMIC_CURRENT_ENV:"test", database:()=>({collection,runTransaction:async callback=>callback({collection})}), getWXContext:()=>({OPENID:"test"}) };
  }
  return originalLoad(request, parent, isMain);
};

const engine = require("../cloudfunctions/battleGame/index.js").__test;

function side(name) {
  return {name,health:30,maxHealth:30,mana:10,maxMana:10,tempMana:0,deck:[],hand:[],board:[],fatigue:0,heroPowerUsed:false,generalSkill:"draw-two",generalSkillUsed:false,turnsTaken:1};
}

function game() {
  return {status:"active",turn:"player",sequence:0,player:side("玩家"),ai:side("对手"),metrics:{cardsPlayed:0,minionsKilled:0,minionsLost:0,heroDamage:0,heroPowerUsed:0,generalSkillUsed:0},log:[]};
}

function card(id, attack, health, keywords=[], effects=[]) {
  return {instanceId:id,id,name:id,rarity:"common",set:"test",element:"✦",type:"minion",cost:1,attack,health,keywords,effects,shiny:false};
}

function minion(state, who, definition) {
  const result = engine.createMinion(definition, state);
  state[who].board.push(result);
  engine.refreshAuras(state);
  return result;
}

function testShield() {
  const state=game(),target=minion(state,"ai",card("shield",2,2,["shield"]));
  assert.equal(engine.damageMinion(target,9),0);
  assert.equal(target.health,2);
  assert.equal(target.shield,false);
  assert.equal(engine.damageMinion(target,9),2);
  assert.equal(target.health,-7);
}

function testLifestealHeroActualDamage() {
  const state=game(),attacker=minion(state,"player",card("leech",6,4,["charge","lifesteal"]));
  state.player.health=20;
  state.ai.health=3;
  engine.performAttack(state,"player",attacker.instanceId,"hero","hero");
  assert.equal(state.player.health,23);
  assert.equal(state.metrics.heroDamage,3);
  assert.equal(state.result,"win");
}

function testEnemyAuraFloorAndRestore() {
  const state=game(),victim=minion(state,"player",card("victim",1,3));
  const source=minion(state,"ai",card("sand",3,7,["aura"],[{trigger:"aura",action:"modify-stats",target:"all-enemy-minions",attack:-1,health:0}]));
  assert.equal(victim.attack,0);
  state.ai.board=state.ai.board.filter(item=>item.instanceId!==source.instanceId);
  engine.refreshAuras(state);
  assert.equal(victim.attack,1);
}

function testSummonCapacity() {
  const state=game();
  for(let index=0;index<6;index++)minion(state,"player",card(`f${index}`,1,1));
  const source=state.player.board[2];
  engine.applyEffect(state,"player",{action:"summon",count:2,token:card("token",1,1)},source);
  assert.equal(state.player.board.length,7);
  assert.equal(state.player.board[3].cardId,"token");
}

function testDeathrattleDoubleNoStack() {
  const state=game();
  const extra={trigger:"aura",action:"deathrattle-extra",target:"other-friendly-minions",value:1};
  minion(state,"player",card("singer1",4,6,["aura"],[extra]));
  minion(state,"player",card("singer2",4,6,["aura"],[extra]));
  const dying=minion(state,"player",card("dying",1,1,["deathrattle"],[{trigger:"deathrattle",action:"damage",target:"enemy-hero",value:1}]));
  dying.health=0;
  engine.resolveDeaths(state);
  assert.equal(state.ai.health,28);
}

function testActiveDeathrattleSnapshotExcludesSummon() {
  const state=game();
  const spirit=card("spirit",1,1,["deathrattle"],[{trigger:"deathrattle",action:"damage",target:"enemy-hero",value:1}]);
  minion(state,"player",card("summoner",1,1,["deathrattle"],[{trigger:"deathrattle",action:"summon",token:spirit,count:1}]));
  const god=minion(state,"player",card("god",8,8,["battlecry"],[{trigger:"battlecry",action:"trigger-deathrattles",target:"other-friendly-minions"}]));
  engine.applyEffect(state,"player",god.effects[0],god);
  assert.equal(state.player.board.length,3);
  assert.equal(state.ai.health,30);
}

function testFilteredAuraDeathAfterRemoval() {
  const state=game();
  const dying=minion(state,"player",card("death",2,1,["deathrattle"],[{trigger:"deathrattle",action:"damage",target:"enemy-hero",value:1}]));
  const source=minion(state,"player",card("keeper",5,6,["shield","aura"],[{trigger:"aura",action:"modify-stats",target:"other-friendly-minions",attack:1,health:1,requiredKeyword:"deathrattle"}]));
  assert.equal(dying.maxHealth,2);
  engine.damageMinion(dying,1);
  state.player.board=state.player.board.filter(item=>item.instanceId!==source.instanceId);
  engine.resolveDeaths(state);
  assert.equal(state.player.board.some(item=>item.cardId==="death"),false);
  assert.equal(state.ai.health,29);
}

function testSimultaneousHeroDeathDraw() {
  const state=game();
  state.player.health=1;
  state.ai.health=1;
  const first=minion(state,"player",card("p",1,1,["deathrattle"],[{trigger:"deathrattle",action:"damage",target:"enemy-hero",value:1}]));
  const second=minion(state,"ai",card("a",1,1,["deathrattle"],[{trigger:"deathrattle",action:"damage",target:"enemy-hero",value:1}]));
  first.health=0;
  second.health=0;
  engine.resolveDeaths(state);
  assert.equal(state.result,"draw");
}

function testFiftyFullTurnLimitDraw() {
  const state=game();
  state.halfTurns=99;
  state.player.deck=[card("draw-card",1,1)];
  engine.beginTurn(state,"player",false);
  assert.equal(state.halfTurns,100);
  assert.equal(state.status,"active");
  engine.beginTurn(state,"ai",false);
  assert.equal(state.halfTurns,101);
  assert.equal(state.status,"finished");
  assert.equal(state.result,"draw");
}

function testGuardRestrictsAttackTargets() {
  const state=game(),attacker=minion(state,"player",card("attacker",4,4,["charge"]));
  const guard=minion(state,"ai",card("guard",1,3,["guard"]));
  const other=minion(state,"ai",card("other",1,3));
  assert.throws(()=>engine.performAttack(state,"player",attacker.instanceId,"hero","hero"),/攻击目标无效/);
  assert.throws(()=>engine.performAttack(state,"player",attacker.instanceId,"minion",other.instanceId),/攻击目标无效/);
  engine.performAttack(state,"player",attacker.instanceId,"minion",guard.instanceId);
  assert.equal(state.ai.board.some(item=>item.instanceId===guard.instanceId),false);
}

function testGuardDeathrattleCombination() {
  const state=game(),attacker=minion(state,"player",card("attacker",5,5,["charge"]));
  const singer=minion(state,"ai",card("r009",4,4,["guard","deathrattle"],[{trigger:"deathrattle",action:"damage",target:"all-enemy-minions",value:1}]));
  const ally=minion(state,"ai",card("ally",2,2));
  assert.throws(()=>engine.performAttack(state,"player",attacker.instanceId,"minion",ally.instanceId),/攻击目标无效/);
  engine.performAttack(state,"player",attacker.instanceId,"minion",singer.instanceId);
  assert.equal(state.ai.board.some(item=>item.instanceId===singer.instanceId),false);
  assert.equal(attacker.health,0);
  assert.equal(state.player.board.length,0);
}

function testRushCannotAttackHeroOnEntry() {
  const state=game(),attacker=minion(state,"player",card("rusher",3,3,["rush"]));
  const defender=minion(state,"ai",card("defender",1,2));
  assert.throws(()=>engine.performAttack(state,"player",attacker.instanceId,"hero","hero"),/攻击目标无效/);
  engine.performAttack(state,"player",attacker.instanceId,"minion",defender.instanceId);
  assert.equal(state.ai.board.length,0);
}

function testBattlecryTriggersWhenPlayed() {
  const state=game(),definition=card("battlecry",2,2,["battlecry"],[{trigger:"battlecry",action:"damage",target:"enemy-hero",value:2}]);
  state.player.hand.push(definition);
  engine.playCard(state,"player",definition.instanceId,0);
  assert.equal(state.ai.health,28);
  assert.equal(state.metrics.cardsPlayed,1);
  assert.equal(state.player.board[0].cardId,"battlecry");
}

function testAiRushSkipsEmptyBoard() {
  const state=game(),rusher=minion(state,"ai",card("ai-rusher",3,3,["rush"]));
  state.turn="ai";
  state.difficulty="normal";
  state.ai.mana=0;
  state.ai.tempMana=0;
  assert.doesNotThrow(()=>engine.aiTurn(state));
  assert.equal(state.turn,"player");
  assert.equal(state.player.health,29);
  assert.equal(rusher.attacksLeft,1);
}

function testSilenceRemovesKeywordsShieldAndDeathrattle() {
  const state=game();
  const target=minion(state,"ai",card("silence-target",3,3,["guard","shield","deathrattle"],[{trigger:"deathrattle",action:"damage",target:"enemy-hero",value:5}]));
  engine.applyEffect(state,"player",{action:"silence",target:"all-enemy-minions"},null);
  assert.equal(target.silenced,true);
  assert.deepEqual(target.keywords,[]);
  assert.deepEqual(target.effects,[]);
  assert.equal(target.shield,false);
  target.health=0;
  engine.resolveDeaths(state);
  assert.equal(state.player.health,30);
  assert.equal(state.ai.graveyard.length,1);
}

function testSilenceAllMinionsAndAuraRemovalDeath() {
  const state=game();
  const fragile=minion(state,"player",card("fragile",2,1));
  fragile.health=1;
  minion(state,"player",card("aura-source",2,3,["aura"],[{trigger:"aura",action:"modify-stats",target:"other-friendly-minions",attack:0,health:1}]));
  const enemy=minion(state,"ai",card("enemy-guard",2,2,["guard"]));
  assert.equal(fragile.maxHealth,2);
  engine.damageMinion(fragile,1);
  engine.applyEffect(state,"player",{action:"silence",target:"all-minions"},null);
  assert.equal(state.player.board.some(item=>item.cardId==="fragile"),false);
  assert.equal(state.player.graveyard.some(item=>item.cardId==="fragile"),true);
  assert.equal(enemy.silenced,true);
  assert.deepEqual(enemy.keywords,[]);
}

function testSpellSilencesEnemiesAndEntersGraveyard() {
  const state=game();
  const friendly=minion(state,"player",card("friendly",2,2,["guard"]));
  const enemy=minion(state,"ai",card("enemy",2,2,["guard","shield"]));
  const spell={instanceId:"spell-1",id:"l004",name:"万籁归寂",rarity:"legendary",set:"base",element:"◌",type:"spell",cost:1,attack:null,health:null,keywords:[],effects:[{trigger:"cast",action:"silence",target:"all-enemy-minions"}],rulesText:"沉默所有敌方随从。"};
  state.player.hand.push(spell);
  const manaBefore=state.player.mana;
  engine.playCard(state,"player",spell.instanceId,0);
  assert.equal(state.player.mana,manaBefore-1);
  assert.equal(friendly.silenced,false);
  assert.equal(enemy.silenced,true);
  assert.equal(state.player.graveyard.length,1);
  assert.equal(state.player.graveyard[0].cardId,"l004");
  assert.equal(state.player.graveyard[0].type,"spell");
  assert.equal(state.player.hand.length,0);
}

function testDeathrattleSilenceWallRecordsBeforeEffect() {
  const state=game();
  const wall=minion(state,"player",card("e009",0,6,["deathrattle"],[{trigger:"deathrattle",action:"silence",target:"all-minions"}]));
  const ally=minion(state,"player",card("ally",3,3,["shield"]));
  const enemy=minion(state,"ai",card("enemy",3,3,["guard"]));
  wall.health=0;
  engine.resolveDeaths(state);
  assert.equal(state.player.graveyard[0].cardId,"e009");
  assert.equal(ally.silenced,true);
  assert.equal(enemy.silenced,true);
}

function testFinishedBattleClearsOnlyTransientGraveyards() {
  const state=game();
  state.status="finished";
  state.player.graveyard=[{cardId:"l004"}];
  state.ai.graveyard=[{cardId:"e009"}];
  state.actionEvents=[{actor:"ai",type:"attack",state:{player:{graveyard:[{cardId:"l004"}]},ai:{graveyard:[{cardId:"e009"}]}}}];
  engine.clearFinishedTransient(state);
  assert.deepEqual(state.player.graveyard,[]);
  assert.deepEqual(state.ai.graveyard,[]);
  assert.equal(state.actionEvents.length,1);
  assert.deepEqual(state.actionEvents[0].state.player.graveyard,[]);
  assert.deepEqual(state.actionEvents[0].state.ai.graveyard,[]);
}

function testTargetedSpellRequiresAndUsesSelectedTarget() {
  const state=game();
  const enemy=minion(state,"ai",card("target",2,4,["guard"]));
  const spell={instanceId:"target-spell",id:"test-spell",name:"定点沉默",rarity:"common",set:"test",element:"✦",type:"spell",cost:1,attack:null,health:null,keywords:[],effects:[{trigger:"cast",action:"silence",target:"selected-enemy-minion"}]};
  state.player.hand.push(spell);
  assert.throws(()=>engine.playCard(state,"player",spell.instanceId,0),/法术目标无效/);
  assert.equal(state.player.hand.length,1);
  engine.playCard(state,"player",spell.instanceId,0,{targetType:"minion",targetId:enemy.instanceId});
  assert.equal(enemy.silenced,true);
  assert.equal(state.player.graveyard[0].cardId,"test-spell");
}

function testDuplicateMulliganIsIdempotent() {
  const state=game();
  state.phase="mulligan";
  state.firstPlayer="player";
  state.halfTurns=0;
  state.player.hand.push(card("keep",1,1),card("swap",1,1));
  state.player.deck.push(card("draw",1,1));
  state.ai.hand.push(card("ai-keep",1,1));
  state.ai.deck.push(card("ai-draw",1,1));
  engine.mulliganAction(state,["swap"]);
  assert.equal(state.phase,"battle");
  assert.equal(state.player.hand.length,2);
  const snapshot=JSON.stringify(state);
  engine.mulliganAction(state,["swap"]);
  assert.equal(JSON.stringify(state),snapshot);
}

function testGuardBlocksHeroAttackWithHint() {
  const state=game();
  const guard=minion(state,"ai",card("wall",1,5,["guard"]));
  const attacker=minion(state,"player",card("hammer",10,10));
  attacker.canAttack=true;
  attacker.attacksLeft=1;
  assert.throws(()=>engine.performAttack(state,"player",attacker.instanceId,"hero","hero"),/攻击目标无效：必须先攻击城墙随从/);
  engine.performAttack(state,"player",attacker.instanceId,"minion",guard.instanceId);
  assert.equal(state.ai.board.length,0);
  assert.equal(state.ai.graveyard.length,1);
  assert.equal(state.ai.graveyard[0].cardId,"wall");
  assert.equal((state.player.graveyard||[]).length,0);
  assert.equal(state.metrics.minionsKilled,1);
}

function testAttackDeathRecordsBothSides() {
  const state=game();
  state.turn="ai";
  const enemy=minion(state,"ai",card("brute",9,9));
  enemy.canAttack=true;
  enemy.attacksLeft=1;
  const mine=minion(state,"player",card("rookie",1,2));
  engine.performAttack(state,"ai",enemy.instanceId,"minion",mine.instanceId);
  assert.equal(state.player.board.length,0);
  assert.equal(state.player.graveyard.length,1);
  assert.equal(state.player.graveyard[0].cardId,"rookie");
  assert.equal(state.metrics.minionsLost,1);

  // 反向：玩家击杀敌方随从时，墓地必须记在敌方一侧（真机曾报「墓 0」）
  const mirror=game();
  const hunter=minion(mirror,"player",card("giant",9,9));
  hunter.canAttack=true;hunter.attacksLeft=1;
  const prey=minion(mirror,"ai",card("tiny",1,2));
  engine.performAttack(mirror,"player",hunter.instanceId,"minion",prey.instanceId);
  assert.equal(mirror.ai.board.length,0);
  assert.equal(mirror.ai.graveyard.length,1);
  assert.equal(mirror.ai.graveyard[0].cardId,"tiny");
  assert.equal((mirror.player.graveyard||[]).length,0);
  assert.equal(mirror.metrics.minionsKilled,1);
}

function testHeroAttackAcceptsAnyTargetId() {
  const state=game();
  const first=minion(state,"player",card("lancer",4,4));
  first.canAttack=true; first.attacksLeft=1;
  engine.performAttack(state,"player",first.instanceId,"hero","ai");
  assert.equal(state.ai.health,30-4);
  const second=minion(state,"player",card("spear",4,4));
  second.canAttack=true; second.attacksLeft=1;
  engine.performAttack(state,"player",second.instanceId,"hero","hero");
  assert.equal(state.ai.health,30-8);
}

const tests=[
  testShield,
  testLifestealHeroActualDamage,
  testEnemyAuraFloorAndRestore,
  testSummonCapacity,
  testDeathrattleDoubleNoStack,
  testActiveDeathrattleSnapshotExcludesSummon,
  testFilteredAuraDeathAfterRemoval,
  testSimultaneousHeroDeathDraw,
  testFiftyFullTurnLimitDraw,
  testGuardRestrictsAttackTargets,
  testGuardDeathrattleCombination,
  testRushCannotAttackHeroOnEntry,
  testBattlecryTriggersWhenPlayed,
  testAiRushSkipsEmptyBoard,
  testSilenceRemovesKeywordsShieldAndDeathrattle,
  testSilenceAllMinionsAndAuraRemovalDeath,
  testSpellSilencesEnemiesAndEntersGraveyard,
  testDeathrattleSilenceWallRecordsBeforeEffect,
  testFinishedBattleClearsOnlyTransientGraveyards,
  testTargetedSpellRequiresAndUsesSelectedTarget,
  testDuplicateMulliganIsIdempotent,
  testGuardBlocksHeroAttackWithHint,
  testAttackDeathRecordsBothSides,
  testHeroAttackAcceptsAnyTargetId
];
tests.forEach(test=>test());

console.log(`battle engine tests passed: ${tests.length}`);
