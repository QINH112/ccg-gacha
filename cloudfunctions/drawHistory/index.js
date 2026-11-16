"use strict";
const cloud=require("wx-server-sdk");cloud.init({env:cloud.DYNAMIC_CURRENT_ENV});const db=cloud.database();
exports.main=async event=>{const{OPENID}=cloud.getWXContext();const limit=Math.min(100,Math.max(1,Number(event.limit||100)));const result=await db.collection("drawLogs").where({userId:OPENID}).orderBy("createdAt","desc").limit(limit).get();return{history:result.data};};
