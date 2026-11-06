import React, { useRef, useState, useCallback, useMemo } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Grid, Environment, ContactShadows, Edges } from '@react-three/drei';

const MATERIALS = {
  intonaco: '#e9e2d3',
  pietra: '#a89c8b',
  legno: '#a77a51',
  cemento: '#a7aeac',
  bianco: '#f7f7f1',
  verde: '#657f6a',
};
const initial = [
  { id: 'living', label: 'Divano', kind: 'box', position: [-1.8, 0.55, -0.1], size: [2.1, 1.1, 0.8], material: 'verde' },
  { id: 'table', label: 'Tavolo', kind: 'box', position: [1.1, 0.42, 0.5], size: [1.6, 0.84, 0.9], material: 'legno' },
];
const nextId = () => 'obj-' + Math.random().toString(36).slice(2, 10);
function validateProject(data) {
  if (!data || !Array.isArray(data.items) || data.items.length > 250) throw Error('Formato progetto non valido');
  const items = data.items.map((o) => {
    if (!o || typeof o.label !== 'string' || o.label.length > 80 ||
        !Array.isArray(o.position) || !Array.isArray(o.size) ||
        o.position.length !== 3 || o.size.length !== 3 ||
        ![...o.position, ...o.size].every(Number.isFinite) ||
        o.size.some(v => v <= 0 || v > 30) || o.position.some(v => Math.abs(v) > 100) ||
        !Object.hasOwn(MATERIALS, o.material)) throw Error('Elemento del progetto non valido');
    return { id: nextId(), label: o.label, kind: 'box', position: [...o.position], size: [...o.size], material: o.material };
  });
  return items;
}
function BaseBuilding({ mode }) {
  const exterior = mode === 'esterni';
  return <group>
    <mesh position={[0,-0.11,0]} receiveShadow><boxGeometry args={[11,.2,9]}/><meshStandardMaterial color="#bdc8b5"/></mesh>
    <mesh position={[0,0,0]} receiveShadow><boxGeometry args={[7.6,.15,6.6]}/><meshStandardMaterial color="#ded6c8"/></mesh>
    <mesh position={[-3.72,1.55,0]} castShadow receiveShadow><boxGeometry args={[.16,3.1,6.6]}/><meshStandardMaterial color="#eee6da" transparent opacity={exterior ? 1 : .18}/></mesh>
    <mesh position={[3.72,1.55,0]} castShadow receiveShadow><boxGeometry args={[.16,3.1,6.6]}/><meshStandardMaterial color="#eee6da" transparent opacity={exterior ? 1 : .18}/></mesh>
    <mesh position={[0,1.55,-3.22]} castShadow receiveShadow><boxGeometry args={[7.6,3.1,.16]}/><meshStandardMaterial color="#eee6da" transparent opacity={exterior ? 1 : .18}/></mesh>
    {exterior && <group>
      <mesh position={[0,3.23,0]} castShadow><boxGeometry args={[8,.25,7]}/><meshStandardMaterial color="#454b4d"/></mesh>
      <mesh position={[-2.4,1.85,3.25]} castShadow><boxGeometry args={[1.65,1.45,.1]}/><meshStandardMaterial color="#668d9c" metalness={.2} roughness={.18}/></mesh>
      <mesh position={[-2.4,1.85,3.33]}><boxGeometry args={[.09,1.48,.13]}/><meshStandardMaterial color="#353b38"/></mesh>
      <mesh position={[0.35,1.15,3.29]} castShadow><boxGeometry args={[1.15,2.2,.12]}/><meshStandardMaterial color="#84664c"/></mesh>
      <mesh position={[2.35,1.85,3.25]}><boxGeometry args={[1.65,1.45,.1]}/><meshStandardMaterial color="#668d9c" metalness={.2} roughness={.18}/></mesh>
    </group>}
    <mesh position={[0,1.55,3.22]}><boxGeometry args={[7.6,3.1,.1]}/><meshStandardMaterial color="#e5ddce" transparent opacity={exterior ? .42 : .06} depthWrite={false}/></mesh>
  </group>;
}
function EditableObject({ item, selected, onPick }) {
  return <mesh castShadow receiveShadow position={item.position} onClick={e => {e.stopPropagation();onPick(item.id);}}>
    <boxGeometry args={item.size}/>
    <meshStandardMaterial color={MATERIALS[item.material]} roughness={.8}/>
    {selected && <Edges color="#69e4c0" scale={1.015}/>}
  </mesh>;
}
function CaptureBridge({ captureRef }) {
  const { gl, scene, camera } = useThree();
  captureRef.current = () => {
    gl.render(scene, camera);
    return gl.domElement.toDataURL('image/png');
  };
  return null;
}
function Scene({ items, selection, setSelection, mode, captureRef }) {
  return <Canvas shadows camera={{ position: [10,8,12], fov: 48 }} gl={{ preserveDrawingBuffer: true, antialias: true }} onPointerMissed={() => setSelection(null)}>
    <color attach="background" args={['#eaf0ed']}/>
    <ambientLight intensity={.85}/>
    <directionalLight castShadow intensity={2.1} position={[8,12,6]} shadow-mapSize={[2048,2048]}/>
    <Environment preset="city"/>
    <BaseBuilding mode={mode}/>
    {items.map(item => <EditableObject key={item.id} item={item} selected={selection === item.id} onPick={setSelection}/>)}
    <Grid infiniteGrid cellSize={1} cellThickness={.35} sectionSize={5} sectionThickness={.6} fadeDistance={40} sectionColor="#708780" cellColor="#b7c9c2"/>
    <ContactShadows opacity={.22} scale={18} blur={2.5} far={10}/>
    <OrbitControls makeDefault target={[0,1,0]} minDistance={3} maxDistance={35} maxPolarAngle={Math.PI/2.03}/>
    <CaptureBridge captureRef={captureRef}/>
  </Canvas>;
}
function download(name, content, type) {
  const href = URL.createObjectURL(new Blob([content],{type}));
  const a = document.createElement('a'); a.href=href; a.download=name; a.click();
  setTimeout(() => URL.revokeObjectURL(href),1000);
}
export default function App() {
  const [mode,setMode] = useState('esterni');
  const [items,setItems] = useState(initial);
  const [selection,setSelection] = useState(null);
  const [message,setMessage] = useState('');
  const upload = useRef(null);
  const captureRef = useRef(null);
  const chosen = useMemo(() => items.find(o => o.id === selection),[items,selection]);
  const update = useCallback((changes) => setItems(prev=>prev.map(item=>item.id===selection?{...item,...changes}:item)),[selection]);
  const add = (label, material, size) => {
    const id = nextId();
    setItems(prev=>[...prev,{id,label,kind:'box',position:[0,size[1]/2,1],size,material}]);
    setSelection(id);
    setMessage(label+' aggiunto al progetto');
  };
  const screenshot = () => {
    const data = captureRef.current?.();
    if (!data) return;
    const a=document.createElement('a'); a.href=data; a.download='pianta-libera-render.png'; a.click();
    setMessage('Vista esportata in PNG');
  };
  const aiRender = () => setMessage('Il modulo AI non è ancora collegato: configura il backend prima di attivare la generazione.');
  const save = () => {download('pianta-libera-progetto.json',JSON.stringify({version:1,items},null,2),'application/json');setMessage('Progetto salvato');};
  const open = async e => {
    const file=e.target.files?.[0];if(!file)return;
    try {
      if(file.size>1024*1024)throw Error('File troppo grande');
      const objects=validateProject(JSON.parse(await file.text()));
      setItems(objects);setSelection(null);setMessage('Progetto caricato');
    }catch(err){setMessage('Impossibile aprire il progetto: '+err.message);}
    e.target.value='';
  };
  return <div className="app">
    <header className="topbar"><div className="brand"><span className="mark">◭</span><div><strong>PIANTA LIBERA</strong><small>ARCHITECTURAL STUDIO</small></div></div>
      <span className="version">3D WORKSPACE · MVP 0.1</span>
      <div className="header-actions"><button onClick={save}>Salva progetto</button><button onClick={()=>upload.current?.click()}>Apri JSON</button><input hidden ref={upload} type="file" accept=".json,application/json" onChange={open}/></div>
    </header>
    <main className="workspace">
      <aside className="sidebar">
        <p className="eyebrow">PROGETTAZIONE</p><h2>Ambiente 3D</h2><p className="hint">Crea elementi schematici, modifica dimensioni e visualizza la scena in tempo reale.</p>
        <label className="field">Vista<select value={mode} onChange={e=>setMode(e.target.value)}><option value="esterni">Esterni</option><option value="interni">Interni</option></select></label>
        <p className="group-title">AGGIUNGI ELEMENTO</p>
        <div className="action-grid"><button onClick={()=>add('Volume','intonaco',[1.8,2.8,1.5])}>＋ Volume</button><button onClick={()=>add('Arredo','legno',[1.4,.8,.8])}>＋ Arredo</button><button onClick={()=>add('Piano','cemento',[2,.15,2])}>＋ Piano</button><button onClick={()=>add('Parete','intonaco',[3,2.8,.16])}>＋ Parete</button></div>
        <p className="group-title">ELEMENTI PRESENTI</p>
        <div className="object-list">{items.map(o=><button key={o.id} className={selection===o.id?'selected':''} onClick={()=>setSelection(o.id)}>{o.label}<span>#{o.id.slice(-4)}</span></button>)}</div>
        <p className="hint bottom-hint">Trascina per orbitare · rotella per zoom · clicca su un oggetto per selezionarlo.</p>
      </aside>
      <section className="viewport"><div className="viewport-label">{mode==='esterni'?'VISTA ESTERNA':'VISTA INTERNA'} <span>● TEMPO REALE</span></div><Scene mode={mode} items={items} selection={selection} setSelection={setSelection} captureRef={captureRef}/><div className="viewport-footer">Unità di misura: metri · Scena dimostrativa</div></section>
      <aside className="inspector">
        <p className="eyebrow">PROPRIETÀ</p><h2>{chosen?chosen.label:'Nessuna selezione'}</h2>
        {chosen?<div className="controls">
          <label className="field">Nome<input value={chosen.label} maxLength={80} onChange={e=>update({label:e.target.value})}/></label>
          <label className="field">Materiale<select value={chosen.material} onChange={e=>update({material:e.target.value})}>{Object.keys(MATERIALS).map(m=><option key={m} value={m}>{m}</option>)}</select></label>
          {['Larghezza','Altezza','Profondità'].map((name,i)=><label className="field" key={name}>{name} (m)<input type="number" min=".05" max="30" step=".1" value={chosen.size[i]} onChange={e=>{const val=Number(e.target.value);if(!Number.isFinite(val)||val<=0||val>30)return;const size=[...chosen.size];size[i]=val;update({size});}}/></label>)}
          {['Posizione X','Posizione Y','Posizione Z'].map((name,i)=><label className="field" key={name}>{name} (m)<input type="number" min="-100" max="100" step=".1" value={chosen.position[i]} onChange={e=>{const val=Number(e.target.value);if(!Number.isFinite(val)||Math.abs(val)>100)return;const position=[...chosen.position];position[i]=val;update({position});}}/></label>)}
          <button className="danger" onClick={()=>{setItems(prev=>prev.filter(x=>x.id!==selection));setSelection(null);}}>Elimina elemento</button>
        </div>:<p className="hint">Seleziona un elemento nella scena o nel pannello a sinistra per modificarlo.</p>}
        <div className="render-box"><p className="eyebrow">RENDERING</p><h3>Esporta la tua idea</h3><button className="primary" onClick={screenshot}>↓ Esporta vista PNG</button><button className="ai" onClick={aiRender}>✦ Render fotorealistico AI</button><p className="hint">Il render AI sarà attivato dopo la configurazione sicura dell'API.</p></div>
        {message&&<div role="status" className="status">{message}</div>}
      </aside>
    </main>
  </div>;
}
