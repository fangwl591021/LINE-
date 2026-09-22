import {chooseMove} from './gomoku-engine.mjs';
self.onmessage=({data})=>{try{self.postMessage({id:data.id,move:chooseMove(data.board,data.side,data.level,data.seed)});}catch{self.postMessage({id:data.id,error:true});}};
