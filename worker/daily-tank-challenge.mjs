// Compatibility facade: old routes, map versions and reward keys are retained.
import {handleGameCenter} from './game-center.mjs';
export {CHALLENGE_KEY,REWARD_POINTS} from './game-reward.mjs';
export {taiwanDate} from './game-session.mjs';
export const handleDailyTank=(action,payload,env,actor,deps)=>handleGameCenter(action,payload,env,actor,deps,{legacy:true});
