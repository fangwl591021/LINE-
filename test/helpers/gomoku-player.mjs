import {createGame,placeMove,chooseMove} from '../../js/modules/gomoku-engine.mjs';
// Legal human moves against normal seed 1, derived without changing the opponent.
export const gomokuWin=[[2,0],[3,1],[4,1],[3,3],[2,2],[1,3],[2,3],[2,1],[4,5],[3,4],[1,2],[3,5],[4,6],[5,4],[5,8],[6,7],[3,8],[4,10],[3,9],[8,8],[8,4],[7,4],[8,6],[7,9],[6,5],[5,11],[6,12],[7,13]];
export function gomokuLoss(seed=1){
 const game=createGame();
 while(!game.winner&&!game.draw){const i=game.board.findIndex((v,i)=>!v&&(i%15+Math.floor(i/15))%2===0),m=game.turn===1&&i>=0?{x:i%15,y:Math.floor(i/15)}:chooseMove(game.board,game.turn,'normal',seed);placeMove(game,m.x,m.y);}
 if(game.winner!==2)throw Error('loss fixture no longer loses');
 return game.moves.filter(m=>m.side===1).map(m=>[m.x,m.y]);
}
