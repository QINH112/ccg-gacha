"use strict";

const source = require("fs").readFileSync("game.js", "utf8");
const searchStart = source.indexOf("function collectionSearchText");
const filterStart = source.indexOf("function matchesCollectionCard");
const filterEnd = source.indexOf("function filteredCards");
if (searchStart < 0 || filterStart < 0 || filterEnd < 0) throw new Error("collection matcher missing");
const searchSource = source.slice(searchStart, filterStart);
const filterSource = source.slice(filterStart, filterEnd);
const {matchesCollectionCard} = new Function("KEYWORD_LABEL", `${searchSource}${filterSource}; return {matchesCollectionCard};`)({guard:"城墙",deathrattle:"亡语"});

const cards = [
  {id:"c001",name:"星尘学徒",set:"base",rarity:"common",cost:1,rulesText:"抽一张牌",description:"",keywords:[]},
  {id:"r002",name:"城墙守卫",set:"base",rarity:"epic",cost:3,rulesText:"具有城墙",description:"",keywords:["guard"]},
  {id:"s003",name:"月影",set:"remnant",rarity:"legendary",cost:3,rulesText:"触发亡语",description:"",keywords:["deathrattle"]}
];
const empty = {sets:[],rarities:[],costs:[]};
const assert = (condition, message) => { if (!condition) throw new Error(message); };
assert(matchesCollectionCard(cards[0], empty, "学徒"), "name fuzzy search failed");
assert(matchesCollectionCard(cards[1], empty, "r002"), "id fuzzy search failed");
assert(matchesCollectionCard(cards[1], empty, "城墙"), "keyword label search failed");
assert(matchesCollectionCard(cards[2], empty, "亡语"), "rule/keyword search failed");
assert(matchesCollectionCard(cards[0], {...empty, sets:["base","remnant"]}, ""), "same-category OR failed");
assert(!matchesCollectionCard(cards[2], {...empty, sets:["base"]}, ""), "set filter failed");
assert(matchesCollectionCard(cards[1], {sets:["base"],rarities:["epic"],costs:[3]}, ""), "cross-category AND failed");
assert(!matchesCollectionCard(cards[0], {sets:["base"],rarities:["epic"],costs:[3]}, ""), "combined mismatch failed");
if (!source.includes("function collectionVersionMatches") || !source.includes("collectionVersionMatches(entry.card,state.collectionFilters.versions)")) throw new Error("version filter missing");
if (!source.includes("state.collectionSearch=\"\"")) throw new Error("search reset missing");
console.log("collection-filter-regression-ok");
