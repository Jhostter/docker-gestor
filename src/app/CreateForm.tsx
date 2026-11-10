"use client";
import { useState } from "react";
import { Btn, Icon, Modal } from "./ui";
import { useT } from "./i18n";

const RE = { port: /^\d{1,5}:\d{1,5}(\/(tcp|udp))?$/, env: /^[A-Za-z_][A-Za-z0-9_]*=.*$/, vol: /^[^:\0]+:\/[^:\0]*(:ro|:rw)?$/ };
const field = "w-full rounded-md border border-line bg-bg px-3 py-2 text-sm placeholder:text-muted";

function List({ label, hint, values, onChange, placeholder, valid }: { label: string; hint: string; values: string[]; onChange: (v: string[]) => void; placeholder: string; valid: RegExp }) {
  const { t } = useT();
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-sm font-medium">{label}</legend>
      <p className="text-xs text-muted">{hint}</p>
      {values.map((v, i) => (
        <div key={i} className="flex gap-1.5">
          <input aria-label={`${label} ${i + 1}`} value={v} placeholder={placeholder} onChange={(e) => onChange(values.map((x, j) => (j === i ? e.target.value : x)))}
            className={`${field} ${v && !valid.test(v) ? "border-bad" : ""}`} />
          <Btn kind="ghost" icon="x" label={t("cr_remove")} onClick={() => onChange(values.filter((_, j) => j !== i))} />
        </div>
      ))}
      <button type="button" onClick={() => onChange([...values, ""])} className="flex items-center gap-1 text-xs text-accent hover:underline"><Icon name="plus" className="size-3" />{t("cr_add")}</button>
    </fieldset>
  );
}

export default function CreateForm({ networks, images, onClose, onSubmit }: { networks: string[]; images: string[]; onClose: () => void; onSubmit: (body: object) => Promise<void> }) {
  const { t } = useT();
  const [image, setImage] = useState(""), [name, setName] = useState(""), [restart, setRestart] = useState("no"), [network, setNetwork] = useState("");
  const [ports, setPorts] = useState<string[]>([]), [env, setEnv] = useState<string[]>([]), [vols, setVols] = useState<string[]>([]);
  const [busy, setBusy] = useState(false), [err, setErr] = useState("");
  const clean = (a: string[]) => a.map((x) => x.trim()).filter(Boolean);
  const bad = !image.trim() || clean(ports).some((v) => !RE.port.test(v)) || clean(env).some((v) => !RE.env.test(v)) || clean(vols).some((v) => !RE.vol.test(v));

  return (
    <Modal wide title={t("new_container")} onClose={onClose}>
      <form className="space-y-4" onSubmit={async (e) => {
        e.preventDefault(); setBusy(true); setErr("");
        try { await onSubmit({ image: image.trim(), name: name.trim() || undefined, ports: clean(ports), env: clean(env), volumes: clean(vols), restart, network: network || undefined }); onClose(); }
        catch (ex) { setErr((ex as Error).message); setBusy(false); }
      }}>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium">{t("cr_image")} *
            <input required list="local-images" autoFocus value={image} onChange={(e) => setImage(e.target.value)} placeholder="nginx:latest" className={`${field} mt-1 font-normal`} />
            <datalist id="local-images">{images.map((i) => <option key={i} value={i} />)}</datalist>
            <span className="mt-1 block text-xs font-normal text-muted">{t("cr_image_hint")}</span>
          </label>
          <label className="block text-sm font-medium">{t("cr_name")}
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("cr_name_ph")} className={`${field} mt-1 font-normal`} />
          </label>
        </div>
        <List label={t("cr_ports")} hint={t("cr_ports_hint")} values={ports} onChange={setPorts} placeholder="8080:80" valid={RE.port} />
        <List label={t("cr_env")} hint={t("cr_env_hint")} values={env} onChange={setEnv} placeholder={t("cr_ph_env")} valid={RE.env} />
        <List label={t("tab_volumes")} hint={t("cr_vols_hint")} values={vols} onChange={setVols} placeholder={t("cr_ph_vol")} valid={RE.vol} />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium">{t("cr_restart")}
            <select value={restart} onChange={(e) => setRestart(e.target.value)} className={`${field} mt-1 font-normal`}>
              <option value="no">{t("cr_r_no")}</option><option value="unless-stopped">{t("cr_r_unless")}</option><option value="always">{t("cr_r_always")}</option><option value="on-failure">{t("cr_r_fail")}</option>
            </select>
          </label>
          <label className="block text-sm font-medium">{t("cr_network")}
            <select value={network} onChange={(e) => setNetwork(e.target.value)} className={`${field} mt-1 font-normal`}>
              <option value="">{t("cr_net_default")}</option>{networks.map((n) => <option key={n}>{n}</option>)}
            </select>
          </label>
        </div>
        {err && <p role="alert" className="rounded-md bg-bad/10 p-2 text-sm text-bad">{err}</p>}
        <div className="flex justify-end gap-2"><Btn onClick={onClose}>{t("cancel")}</Btn><Btn type="submit" kind="primary" busy={busy} disabled={bad}>{t("cr_submit")}</Btn></div>
      </form>
    </Modal>
  );
}
