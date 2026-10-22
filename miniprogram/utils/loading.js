// Share the native loading layer across overlapping detection and export operations.
const active=[];
function render(){
  const current=active[active.length-1];
  if(current)wx.showLoading({title:current.title,mask:true});
  else wx.hideLoading();
}
function begin(title){
  const item={title},previous=active[active.length-1];active.push(item);
  if(!previous||previous.title!==title)render();
  let ended=false;
  return ()=>{
    if(ended)return;ended=true;
    const previous=active[active.length-1];active.splice(active.indexOf(item),1);
    const current=active[active.length-1];
    if(!current||current.title!==previous.title)render();
  };
}
module.exports={begin};
