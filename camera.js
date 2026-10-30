export function cameraPose({first,player,floor=0,yaw,pitch,follow,distance,sitting=false,praying=false}){
 if(first){const eye=[player.x,floor+(sitting?1.35:1.7)-(praying?.06:0),player.y];const c=Math.cos(pitch);return {eye,target:[eye[0]-Math.sin(yaw)*c,eye[1]-Math.sin(pitch),eye[2]-Math.cos(yaw)*c],fov:Math.PI/3};}
 return {eye:[follow[0]+Math.sin(yaw)*Math.cos(pitch)*distance,follow[1]+Math.sin(pitch)*distance,follow[2]+Math.cos(yaw)*Math.cos(pitch)*distance],target:follow,fov:Math.PI/4};
}
