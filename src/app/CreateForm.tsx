"use client";
import { useState } from "react";
import { Btn, Icon, Modal } from "./ui";

const RE = { port: /^\d{1,5}:\d{1,5}(\/(tcp|udp))?$/, env: /^[A-Za-z_][A-Za-z0-9_]*=.*$/, vol: /^[^:\0]+:\/[^:\0]*(:ro|:rw)?$/ };
const field = "w-full rounded-md border border-line bg-bg px-3 py-2 text-sm placeholder:text-muted";

function List({ label, hint, values, onChange, placeholder, valid }: { label: string; hint: string; values: string[]; onChange: (v: string[]) => void; placeholder: string; valid: RegExp }) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-sm font-medium">{label}</legend>
      <p className="text-xs text-muted">{hint}</p>
      {values.map((v, i) => (
        <div key={i} className="flex gap-1.5">
          <input aria-label={`${label} ${i + 1}`} value={v} placeholder={placeholder} onChange={(e) => onChange(values.map((x, j) => (j === i ? e.target.value : x)))}
            className={`${field} ${v && !valid.test(v) ? "border-bad" : ""}`} />
          <Btn kind="ghost" icon="x" label="Quitar" onClick={() => onChange(values.filter((_, j) => j !== i))} />
        </div>
      ))}
      <button type="button" onClick={() => onChange([...values, ""])} className="flex items-center gap-1 text-xs text-accent hover:underline"><Icon name="plus" className="size-3" />Añadir</button>
    </fieldset>
  );
}

export default function CreateForm({ networks, images, onClose, onSubmit }: { networks: string[]; images: string[]; onClose: () => void; onSubmit: (body: object) => Promise<void> }) {
  const [image, setImage] = useState(""), [name, setName] = useState(""), [restart, setRestart] = useState("no"), [network, setNetwork] = useState("");
  const [ports, setPorts] = useState<string[]>([]), [env, setEnv] = useState<string[]>([]), [vols, setVols] = useState<string[]>([]);
  const [busy, setBusy] = useState(false), [err, setErr] = useState("");
  const clean = (a: string[]) => a.map((x) => x.trim()).filter(Boolean);
  const bad = !image.trim() || clean(ports).some((v) => !RE.port.test(v)) || clean(env).some((v) => !RE.env.test(v)) || clean(vols).some((v) => !RE.vol.test(v));

  return (
    <Modal wide title="Nuevo contenedor" onClose={onClose}>
      <form className="space-y-4" onSubmit={async (e) => {
        e.preventDefault(); setBusy(true); setErr("");
        try { await onSubmit({ image: image.trim(), name: name.trim() || undefined, ports: clean(ports), env: clean(env), volumes: clean(vols), restart, network: network || undefined }); onClose(); }
        catch (ex) { setErr((ex as Error).message); setBusy(false); }
      }}>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium">Imagen *
            <input required list="local-images" autoFocus value={image} onChange={(e) => setImage(e.target.value)} placeholder="nginx:latest" className={`${field} mt-1 font-normal`} />
            <datalist id="local-images">{images.map((i) => <option key={i} value={i} />)}</datalist>
            <span className="mt-1 block text-xs font-normal text-muted">Si no existe localmente, se descargará.</span>
          </label>
          <label className="block text-sm font-medium">Nombre
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="(automático)" className={`${field} mt-1 font-normal`} />
          </label>
        </div>
        <List label="Puertos" hint="anfitrión:contenedor, p. ej. 8080:80 (o 53:53/udp). Se publican solo en 127.0.0.1." values={ports} onChange={setPorts} placeholder="8080:80" valid={RE.port} />
        <List label="Variables de entorno" hint="CLAVE=valor" values={env} onChange={setEnv} placeholder="POSTGRES_PASSWORD=secreto" valid={RE.env} />
        <List label="Volúmenes" hint="origen:/ruta/en/contenedor — origen puede ser un volumen con nombre o una ruta del anfitrión; añade :ro para solo lectura." values={vols} onChange={setVols} placeholder="mis_datos:/var/lib/data" valid={RE.vol} />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium">Reinicio automático
            <select value={restart} onChange={(e) => setRestart(e.target.value)} className={`${field} mt-1 font-normal`}>
              <option value="no">No reiniciar</option><option value="unless-stopped">Salvo que se detenga a mano</option><option value="always">Siempre</option><option value="on-failure">Solo si falla</option>
            </select>
          </label>
          <label className="block text-sm font-medium">Red
            <select value={network} onChange={(e) => setNetwork(e.target.value)} className={`${field} mt-1 font-normal`}>
              <option value="">Por defecto (bridge)</option>{networks.map((n) => <option key={n}>{n}</option>)}
            </select>
          </label>
        </div>
        {err && <p role="alert" className="rounded-md bg-bad/10 p-2 text-sm text-bad">{err}</p>}
        <div className="flex justify-end gap-2"><Btn onClick={onClose}>Cancelar</Btn><Btn type="submit" kind="primary" busy={busy} disabled={bad}>Crear e iniciar</Btn></div>
      </form>
    </Modal>
  );
}
