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
  redo() { return this.redos.length ? this.restore(this.redos.pop()) : null; }
  mark(index) { if(this.items[index]) this.items[index].marked = !this.items[index].marked; }
}
module.exports = History;
