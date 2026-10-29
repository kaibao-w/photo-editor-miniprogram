const clone = value => JSON.parse(JSON.stringify(value));
class History {
  constructor(state) { this.items = [{ state: clone(state), label: '初始图片', parent: null, marked: false }]; this.current = 0; this.redos = []; }
  record(state, label) {
    if (JSON.stringify(state) === JSON.stringify(this.items[this.current].state)) return false;
    this.items.push({ state: clone(state), label, parent: this.current, marked: false });
    this.current = this.items.length - 1; this.redos = []; return true;
  }
  restore(index) { if (!this.items[index]) return null; this.current = index; return clone(this.items[index].state); }
  goto(index) { if (!this.items[index]) return null; this.redos = []; return this.restore(index); }
  undo() { const parent = this.items[this.current].parent; if (parent === null) return null; this.redos.push(this.current); return this.restore(parent); }
  nextIndex() {
    // Prefer the branch just undone; direct jumps follow the newest continuation.
    const pending=this.redos[this.redos.length-1];
    if(pending!==undefined && this.items[pending] && this.items[pending].parent===this.current)return pending;
    for(let i=this.items.length-1;i>=0;i--)if(this.items[i].parent===this.current)return i;
    return null;
  }
  get canRedo() { return this.nextIndex()!==null; }
  redo() {
    const next=this.nextIndex();if(next===null)return null;
    if(this.redos[this.redos.length-1]===next)this.redos.pop();else this.redos=[];
    return this.restore(next);
  }
  mark(index) { if(this.items[index]) this.items[index].marked = !this.items[index].marked; }
}
module.exports = History;
