/* profile.jsx — the signed-in user's own profile, with photo upload/display. */

function PhotoUploader({ emp, size = 96 }) {
  const ref = useRef(null);
  const [photo, setPhotoState] = useState(empPhoto(emp));
  const onPick = (file) => {
    if (!file) return;
    const r = new FileReader();
    r.onload = () => { setPhoto(emp.id, r.result); setPhotoState(r.result); };
    r.readAsDataURL(file);
  };
  return (
    <div style={{ position: 'relative', width: size, height: size, flex: 'none' }}>
      <input ref={ref} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => onPick(e.target.files[0])} />
      {photo
        ? <img src={photo} alt={emp.name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover' }} />
        : <div className="avatar" style={{ width: size, height: size, fontSize: size * 0.34, background: 'linear-gradient(150deg, var(--teal), var(--accent))' }}>{emp.name.split(' ').map(w => w[0]).slice(0, 2).join('')}</div>}
      <button onClick={() => ref.current && ref.current.click()} title="Change photo"
        style={{ position: 'absolute', bottom: 0, right: 0, width: 30, height: 30, borderRadius: '50%', border: '2.5px solid var(--surface)', background: 'var(--accent)', color: '#fff', display: 'grid', placeItems: 'center', cursor: 'pointer', boxShadow: 'var(--shadow-sm)' }}>
        <Icon name={photo ? 'pen' : 'plus'} style={{ width: 15, height: 15 }} />
      </button>
    </div>
  );
}

function Field2({ k, v }) {
  return <div><div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--ink-3)', fontWeight: 700 }}>{k}</div><div style={{ fontSize: 14, fontWeight: 600, marginTop: 3 }}>{v || '—'}</div></div>;
}

function Profile({ emp: rawEmp, access, onNav }) {
  const [emp, setEmp] = useState(() => (typeof mergeEmp === 'function' ? mergeEmp(rawEmp) : rawEmp));
  const [editing, setEditing] = useState(false);
  const [photoNudge, setPhotoNudge] = useState(!empPhoto(emp));
  return (
    <div className="fade-in">
      {editing && <EditRecordModal emp={emp} fields={SELF_FIELDS} title="Edit my info" scope="self" onSaved={setEmp} onClose={() => setEditing(false)} />}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 'clamp(22px,3vw,28px)' }}>My profile</h1>
        <button className="btn btn-ghost" onClick={() => setEditing(true)}><Icon name="pen" /> Edit my info</button>
      </div>

      {photoNudge && (
        <div className="card" style={{ padding: '14px var(--pad)', display: 'flex', alignItems: 'center', gap: 14, marginBottom: 'var(--gap)', borderColor: 'var(--accent)', background: 'var(--accent-softer)' }}>
          <Icon name="upload" style={{ width: 22, height: 22, color: 'var(--accent-strong)', flex: 'none' }} />
          <div style={{ flex: 1 }}><div style={{ fontWeight: 700, fontSize: 14.5 }}>Add a profile photo</div><p style={{ fontSize: 13, color: 'var(--ink-2)', marginTop: 2 }}>Help your team put a face to your name — it shows across the directory and schedule.</p></div>
          <button className="btn btn-quiet" onClick={() => setPhotoNudge(false)}><Icon name="x" /></button>
        </div>
      )}

      <div className="card" style={{ padding: 'clamp(20px,3.5vw,30px)', marginBottom: 'var(--gap)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 22, flexWrap: 'wrap' }}>
          <PhotoUploader emp={emp} />
          <div style={{ flex: 1, minWidth: 220 }}>
            <h2 style={{ fontSize: 24 }}>{emp.name}</h2>
            <p style={{ color: 'var(--ink-2)', fontSize: 15.5, marginTop: 4 }}>{emp.jobTitle}</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
              <span className="badge badge-ok"><Icon name="check" /> {emp.status}</span>
              <span className="badge badge-todo"><Icon name="pin" /> {emp.loc}</span>
              <span className="badge badge-prog">{access.label}</span>
              {emp.provider && <span className="badge badge-prog"><Icon name="star" /> Provider</span>}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <a href={`mailto:${emp.workEmail}`} className="btn btn-ghost" style={{ textDecoration: 'none' }}><Icon name="mail" /> {emp.workEmail}</a>
            {emp.phoneExt && <div className="btn btn-ghost" style={{ pointerEvents: 'none' }}><Icon name="phone" /> Ext. {emp.phoneExt}</div>}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 'var(--gap)' }}>
        <div className="card" style={{ padding: 'var(--pad)' }}>
          <h3 style={{ fontSize: 15, marginBottom: 16 }}>Personal</h3>
          <div style={{ display: 'grid', gap: 14 }}>
            <Field2 k="Mobile" v={emp.mobile} />
            <Field2 k="Personal email" v={emp.personalEmail} />
            <Field2 k="Date of birth" v={emp.birthdate} />
            <Field2 k="Home address" v={emp.address} />
            <Field2 k="Emergency contact" v={emp.emergencyName ? `${emp.emergencyName}${emp.emergencyPhone ? ' · ' + emp.emergencyPhone : ''}` : ''} />
          </div>
        </div>
        <div className="card" style={{ padding: 'var(--pad)' }}>
          <h3 style={{ fontSize: 15, marginBottom: 16 }}>Employment</h3>
          <div style={{ display: 'grid', gap: 14 }}>
            <Field2 k="Department" v={emp.department} />
            <Field2 k="Manager" v={emp.manager} />
            <Field2 k="Start date" v={emp.startDate} />
            <Field2 k="Orientation" v={emp.orientation} />
          </div>
        </div>
        <div className="card" style={{ padding: 'var(--pad)' }}>
          <h3 style={{ fontSize: 15, marginBottom: 16 }}>{emp.provider ? 'Credentials' : 'Systems'}</h3>
          <div style={{ display: 'grid', gap: 14 }}>
            {emp.provider && <Field2 k="Provider type" v={emp.providerType} />}
            {emp.provider && <Field2 k="NPI" v={emp.npi} />}
            {emp.provider && <Field2 k="License" v={emp.license} />}
            <Field2 k="Denticon ID" v={emp.denticonId} />
            <Field2 k="Account status" v={emp.accountStatus} />
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 'var(--gap)' }}>
        <button className="btn btn-primary" onClick={() => onNav('onboarding')}><Icon name="sparkle" /> My onboarding</button>
        <button className="btn btn-ghost" onClick={() => onNav('myschedule')}><Icon name="calendar" /> My schedule</button>
      </div>
    </div>
  );
}

Object.assign(window, { Profile });
