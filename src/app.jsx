/*
 * Lucky Exchange: a pass-the-phone gift swap (Secret Santa style) for a group in one room.
 *
 * Game model
 *   - Everyone is placed in ONE shuffled loop: order[i] gives to order[i + 1], and the last gives to the first.
 *     Couples (partnerId) are never neighbours in the loop, so they never get each other.
 *   - `matches` maps receiverId -> giverId. The phone is passed along the loop so each person opens their own gift.
 *
 * Screens (`view` state)
 *   setup -> starter-select -> turn-start -> reveal -> (back to turn-start for the next person) -> summary
 *
 * Progress is saved to localStorage after every change, so a refresh never loses a game.
 * React is loaded from a CDN (see template.html); this file is compiled by build.js into the single index.html.
 */
const { useState, useEffect, useRef } = React;

// ---------- helpers ----------
const STORAGE_KEY = 'luckyExchange.v1';

// Read a saved game back from localStorage. Returns null when nothing valid is stored.
const loadSaved = () => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const d = JSON.parse(raw);
        if (!d || d.version !== 1 || !Array.isArray(d.participants)) return null;
        if (d.view !== 'setup' && (!d.matches || Object.keys(d.matches).length === 0)) d.view = 'setup';
        if (d.view === 'reveal') d.view = 'turn-start'; // never resume onto a result screen
        return d;
    } catch (e) {
        return null;
    }
};

// Unique id for each participant (crypto.randomUUID where available, a random fallback otherwise).
const newId = () => (window.crypto && crypto.randomUUID)
    ? crypto.randomUUID()
    : 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);

// Fisher-Yates shuffle. Returns a new array and leaves the input untouched.
const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
};

// First letter for the avatar. Thai leading vowels (เ แ โ ไ ใ) are not a name's first consonant,
// so skip them and use the consonant that follows.
const initialOf = (name) => {
    const chars = Array.from((name || '?').trim());
    const first = chars.find((c) => !/[\u0E40-\u0E44]/.test(c)) || chars[0] || '?';
    return first.toUpperCase();
};

// Copy text to the clipboard. Uses the modern API on secure pages and falls back to execCommand elsewhere.
const copyText = async (text) => {
    try {
        if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; }
    } catch (e) { /* fall through to the legacy path */ }
    try {
        const ta = document.createElement('textarea');
        ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
        document.body.appendChild(ta); ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return ok;
    } catch (e) { return false; }
};

// The plain-text result that gets shared or copied from the finale screen.
const buildShareText = (historyLog, participants) => {
    const nameOf = (id) => (participants.find((p) => p.id === id) || {}).name || '?';
    return 'Lucky Exchange\n\n' + historyLog.map((e, i) => `${i + 1}. ${nameOf(e.receiverId)} got a gift from ${nameOf(e.giverId)}`).join('\n');
};

// ---------- icons ----------
const PATHS = {
    users: ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0z', 'M22 21v-2a4 4 0 0 0-3-3.87', 'M16 3.13a4 4 0 0 1 0 7.75'],
    gift: ['M20 12v10H4V12', 'M2 7h20v5H2z', 'M12 22V7', 'M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z', 'M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z'],
    heart: ['M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z'],
    heartOff: ['M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z', 'M3 3l18 18'],
    trash: ['M3 6h18', 'M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6', 'M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2'],
    edit: ['M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z'],
    reset: ['M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8', 'M3 3v5h5'],
    list: ['M8 6h13', 'M8 12h13', 'M8 18h13', 'M3 6h.01', 'M3 12h.01', 'M3 18h.01'],
    check: ['M20 6 9 17l-5-5'],
    x: ['M18 6 6 18', 'm6 6 12 12'],
    arrow: ['M5 12h14', 'm12 5 7 7-7 7'],
    alert: ['M12 8v4', 'M12 16h.01', 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0z'],
    copy: ['M9 9h11v11H9z', 'M5 15V5h10'],
    eyeOff: ['M9.88 9.88a3 3 0 1 0 4.24 4.24', 'M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68', 'M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61', 'M2 2l20 20'],
    sparkles: ['m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z'],
};
// Inline SVG icon from the PATHS table above (stroke icons; pass fill for solid ones).
const Ico = ({ n, size = 22, fill = 'none' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {PATHS[n].map((d, i) => <path key={i} d={d} />)}
    </svg>
);

// Neutral circle with the person's initial.
const Avatar = ({ name, size = 42 }) => (
    <div className="avatar" style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}>
        {initialOf(name)}
    </div>
);

// ---------- gift art ----------
// Colours come from CSS (.gift-art .g-*), so the gift follows light and dark mode automatically.
const GiftArt = ({ state }) => (
    <svg viewBox="0 0 200 200" className={'gift-art ' + state} aria-hidden="true">
        <ellipse cx="100" cy="188" rx="64" ry="8" className="gift-shadow" />
        <rect x="36" y="94" width="128" height="86" rx="10" className="g-body" />
        <rect x="90" y="94" width="20" height="86" className="g-ribbon" />
        <g className="gift-lid">
            <rect x="26" y="64" width="148" height="36" rx="10" className="g-lid" />
            <rect x="90" y="64" width="20" height="36" className="g-ribbon" />
            <path d="M100 64 C70 14 30 34 60 62 C76 64 92 64 100 64Z" className="g-bow" />
            <path d="M100 64 C130 14 170 34 140 62 C124 64 108 64 100 64Z" className="g-bow" />
            <circle cx="100" cy="62" r="9" className="g-knot" />
        </g>
    </svg>
);

// ---------- modal ----------
const ConfirmModal = ({ title, text, confirmLabel, onCancel, onConfirm }) => (
    <div className="modal" role="dialog" aria-modal="true" onClick={onCancel}>
        <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>{title}</h3>
            <p>{text}</p>
            <div className="modal-actions">
                <button className="btn btn-quiet" onClick={onCancel}>Cancel</button>
                <button className="btn btn-danger" onClick={onConfirm}>{confirmLabel}</button>
            </div>
        </div>
    </div>
);

// ---------- gift log ----------
const LogBody = ({ historyLog, participants, showCopy = true }) => {
    const [copied, setCopied] = useState(false);
    const listRef = useRef(null);
    useEffect(() => {
        if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
    }, [historyLog.length]);

    const nameOf = (id) => (participants.find((p) => p.id === id) || {}).name || '?';
    const copyList = async () => {
        if (await copyText(buildShareText(historyLog, participants))) { setCopied(true); setTimeout(() => setCopied(false), 1600); }
    };

    return (
        <div className="logbox">
            <div className="log-head">
                <div>
                    <h3>Who gives to whom</h3>
                    <p>{historyLog.length} of {participants.length} gifts opened</p>
                </div>
            </div>
            {historyLog.length === 0 ? (
                <div className="log-empty">Nothing opened yet. Each gift appears here as soon as it is opened.</div>
            ) : (
                <ol className="log-list" ref={listRef}>
                    {historyLog.map((e, i) => (
                        <li className="log-item" key={i}>
                            <span className="num">{i + 1}</span>
                            <Avatar name={nameOf(e.receiverId)} size={36} />
                            <div className="who">
                                <div className="to">{nameOf(e.receiverId)}</div>
                                <div className="from">gets a gift from <b>{nameOf(e.giverId)}</b></div>
                            </div>
                        </li>
                    ))}
                </ol>
            )}
            {historyLog.length > 0 && showCopy && (
                <div className="log-foot">
                    <button className="btn btn-quiet btn-sm btn-block" onClick={copyList}>
                        <Ico n={copied ? 'check' : 'copy'} size={18} /> {copied ? 'Copied' : 'Copy this list'}
                    </button>
                </div>
            )}
        </div>
    );
};

// Bottom sheet that holds the log on narrow screens (on wide screens the log sits in a side panel).
const LogSheet = ({ open, onClose, historyLog, participants }) => (
    <div className={'sheet-wrap' + (open ? ' open' : '')}>
        <div className="sheet-backdrop" onClick={onClose} />
        <div className="sheet" role="dialog" aria-label="Who gives to whom" aria-hidden={!open}>
            <div className="sheet-grab" />
            <div style={{ position: 'absolute', top: 8, right: 8 }}>
                <button className="icon-btn soft" onClick={onClose} aria-label="Close list"><Ico n="x" /></button>
            </div>
            <LogBody historyLog={historyLog} participants={participants} />
        </div>
    </div>
);

// ---------- reveal ----------
// Full-screen gift opening for one person: idle -> shaking -> opening -> revealed (about 1.8s in total).
// Remounted per player (key={player.id}) so its timers and phase always start fresh.
const RevealView = ({ player, giver, nextName, isLast, onNext }) => {
    const [phase, setPhase] = useState('idle'); // idle | shaking | opening | revealed
    const [text, setText] = useState('Tap the gift to open it (แตะเพื่อเปิด)');
    const timers = useRef([]);
    useEffect(() => () => timers.current.forEach(clearTimeout), []);

    const start = () => {
        if (phase !== 'idle') return;
        const later = (fn, ms) => timers.current.push(setTimeout(fn, ms));
        setPhase('shaking');
        setText('Mixing...');
        later(() => setText('Checking the list...'), 550);
        later(() => setText('Who is it?'), 1050);
        later(() => setPhase('opening'), 1250);
        later(() => setPhase('revealed'), 1800);
    };

    return (
        <div className="reveal" role="dialog" aria-modal="true">
            <div className="reveal-in">
                <div className="reveal-chip">
                    Opening for
                    <b>{player.name}</b>
                </div>
                {phase !== 'revealed' ? (
                    <button className="gift-btn" onClick={start} disabled={phase !== 'idle'} aria-label={'Open the gift for ' + player.name}>
                        <GiftArt state={phase === 'idle' ? 'idle' : phase === 'shaking' ? 'shake' : 'open'} />
                        <span className={'gift-cta' + (phase !== 'idle' ? ' live' : '')}>{text}</span>
                    </button>
                ) : (
                    <>
                        <div className="gift-tag">
                            <div className="tag-label">You got a gift from</div>
                            <div className="tag-name">{giver ? giver.name : '?'}</div>
                            <div className="tag-rule" />
                            <div className="tag-sub"><Avatar name={giver ? giver.name : '?'} size={34} /> <span>Merry gifting, {player.name}!</span></div>
                        </div>
                        <button className="btn btn-primary btn-block pop" style={{ animationDelay: '.35s' }} onClick={onNext}>
                            {isLast ? 'See the full list' : 'Pass the phone to ' + nextName}
                            <Ico n="arrow" size={20} />
                        </button>
                    </>
                )}
            </div>
        </div>
    );
};

// ---------- setup ----------
// Step 1: build the friend list. Add one name at a time or paste a list; link couples; start the game.
const SetupView = (p) => {
    const { participants, linkingMode, selectedForLink, editingId, editNameVal } = p;
    const need = participants.length < 3;
    const inputRef = useRef(null);
    const add = () => { p.handleBulkAdd(); if (inputRef.current) inputRef.current.focus(); };
    const onPaste = (e) => {
        const t = (e.clipboardData && e.clipboardData.getData('text')) || '';
        if (/[\n,]/.test(t)) { e.preventDefault(); p.handleBulkAdd(t); }
    };

    // show linked couples next to each other
    const ordered = [];
    const placed = new Set();
    participants.forEach((x) => {
        if (placed.has(x.id)) return;
        placed.add(x.id);
        const partner = participants.find((q) => q.id === x.partnerId);
        if (partner && !placed.has(partner.id)) {
            placed.add(partner.id);
            ordered.push({ x, pair: 'a' }, { x: partner, pair: 'b' });
        } else {
            ordered.push({ x, pair: null });
        }
    });

    return (
        <div className="narrow">
            <div className="card">
                <h2 className="title">Who is playing? <span className="th">(ใครเล่นบ้าง)</span></h2>
                <p className="sub">Type a name and press Add.</p>
                <div className="input-row">
                    <input ref={inputRef} id="names" className="name-input" type="text" placeholder="Name" aria-label="Name"
                        autoComplete="off" autoCapitalize="words" spellCheck="false" enterKeyHint="done"
                        value={p.bulkInput} onChange={(e) => p.setBulkInput(e.target.value)} onPaste={onPaste}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
                    <button className="btn btn-quiet" onClick={add} disabled={!p.bulkInput.trim()}>Add</button>
                </div>
                <p className="input-hint">Paste a list to add everyone at once (วางรายชื่อได้).</p>
            </div>

            {p.errorMsg && (
                <div className="notice" role="alert"><Ico n="alert" size={20} /> <span>{p.errorMsg}</span></div>
            )}

            {participants.length === 0 && (
                <div className="empty"><Ico n="users" size={28} /> Nobody yet. You need at least 3 friends.</div>
            )}

            {participants.length > 0 && (
                <div className="card">
                    <div className="list-head">
                        <h3>Friends ({participants.length})</h3>
                        <div className="row-actions">
                            <button className="btn btn-quiet btn-sm" onClick={p.clearList} disabled={linkingMode}>
                                <Ico n="trash" size={18} /> Clear
                            </button>
                            {!linkingMode && participants.some((x) => x.partnerId) && (
                                <button className="btn btn-quiet btn-sm" onClick={p.askUnlinkAll}>
                                    <Ico n="heartOff" size={18} /> Unlink all
                                </button>
                            )}
                            <button className={'btn btn-quiet btn-sm' + (linkingMode ? ' on' : '')} onClick={() => { p.setLinkingMode(!linkingMode); p.setSelectedForLink(null); }}>
                                <Ico n="heart" size={18} fill={linkingMode ? 'currentColor' : 'none'} /> {linkingMode ? 'Done' : 'Link couples'}
                            </button>
                        </div>
                    </div>
                    {linkingMode && <p className="sub" style={{ marginTop: 0 }}>Tap two people to link them (จับคู่แฟน). Couples will not be matched with each other.</p>}
                    <ul className="people">
                        {ordered.map(({ x, pair }) => {
                            const partner = participants.find((q) => q.id === x.partnerId);
                            return (
                                <li key={x.id}
                                    className={'person' + (linkingMode ? ' linkable' : '') + (selectedForLink === x.id ? ' picked' : '') + (pair ? ' pair pair-' + pair : '')}
                                    onClick={() => linkingMode && p.handleLinkClick(x.id)}>
                                    <Avatar name={x.name} size={40} />
                                    <div className="person-main">
                                        {editingId === x.id ? (
                                            <input autoFocus className="edit" type="text" value={editNameVal}
                                                onChange={(e) => p.setEditNameVal(e.target.value)}
                                                onBlur={() => p.updateName(x.id, editNameVal)}
                                                onKeyDown={(e) => e.key === 'Enter' && p.updateName(x.id, editNameVal)}
                                                onClick={(e) => e.stopPropagation()} />
                                        ) : (
                                            <>
                                                <div className="person-name">{x.name}</div>
                                                {partner && <div className="person-partner"><Ico n="heart" size={13} fill="currentColor" /> with {partner.name}</div>}
                                            </>
                                        )}
                                    </div>
                                    {!linkingMode && (
                                        <div className="row-actions">
                                            <button className="icon-btn soft" aria-label={'Edit ' + x.name} onClick={(e) => { e.stopPropagation(); p.setEditingId(x.id); p.setEditNameVal(x.name); }}><Ico n="edit" size={19} /></button>
                                            {x.partnerId ? (
                                                <button className="icon-btn soft love" aria-label={'Unlink ' + x.name} onClick={(e) => { e.stopPropagation(); p.unlinkPartner(x.id); }}><Ico n="heartOff" size={19} /></button>
                                            ) : (
                                                <button className="icon-btn soft danger" aria-label={'Remove ' + x.name} onClick={(e) => { e.stopPropagation(); p.removeParticipant(x.id); }}><Ico n="trash" size={19} /></button>
                                            )}
                                        </div>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}

            <div className="dock">
                <div className="dock-in">
                    <div className="dock-hint">{need ? 'Add at least 3 friends to start.' : linkingMode ? 'Tap Done when you have finished linking.' : participants.length + ' friends ready'}</div>
                    <button className="btn btn-primary btn-block" onClick={p.generateMatches} disabled={need || linkingMode}>
                        <Ico n="gift" size={22} /> Start game
                    </button>
                </div>
            </div>
        </div>
    );
};

// Finale buttons: one share action (Share on phones, Copy on desktop) plus Play again.
const SummaryActions = ({ historyLog, participants, onReplay }) => {
    const [copied, setCopied] = useState(false);
    const text = buildShareText(historyLog, participants);
    const canShare = typeof navigator !== 'undefined' && !!navigator.share;
    // The phone share sheet already includes Copy, so offer a single action: Share where available, Copy elsewhere.
    const share = async () => { try { await navigator.share({ title: 'Lucky Exchange', text }); } catch (e) { /* cancelled */ } };
    const copy = async () => { if (await copyText(text)) { setCopied(true); setTimeout(() => setCopied(false), 1800); } };
    return (
        <div className="actions">
            {canShare ? (
                <button className="btn btn-primary btn-block" onClick={share}>Share the list</button>
            ) : (
                <button className="btn btn-primary btn-block" onClick={copy}>
                    <Ico n={copied ? 'check' : 'copy'} size={20} /> {copied ? 'Copied' : 'Copy the list'}
                </button>
            )}
            <button className="btn btn-quiet btn-block" onClick={onReplay}>Play again with the same friends</button>
        </div>
    );
};

// ---------- app ----------
// Root component. State is grouped as: game data (participants, matches, revealedIds, historyLog,
// currentPlayerId) which is saved, and UI state (inputs, editing, modals) which is not.
const App = () => {
    const [saved] = useState(loadSaved);
    const [view, setView] = useState(saved ? saved.view : 'setup');
    const [participants, setParticipants] = useState(saved ? saved.participants : []);
    const [matches, setMatches] = useState(saved && saved.matches ? saved.matches : {});
    const [revealedIds, setRevealedIds] = useState(new Set(saved && saved.revealedIds ? saved.revealedIds : []));
    const [historyLog, setHistoryLog] = useState(saved && saved.historyLog ? saved.historyLog : []);
    const [currentPlayerId, setCurrentPlayerId] = useState(saved ? saved.currentPlayerId : null);
    const [bulkInput, setBulkInput] = useState('');
    const [editingId, setEditingId] = useState(null);
    const [editNameVal, setEditNameVal] = useState('');
    const [linkingMode, setLinkingMode] = useState(false);
    const [selectedForLink, setSelectedForLink] = useState(null);
    const [errorMsg, setErrorMsg] = useState(null);
    const [confirm, setConfirm] = useState(null); // 'restart' | 'clear' | 'unlink-all' | null
    const [logOpen, setLogOpen] = useState(false);

    const inGame = view !== 'setup';
    const inPlay = view === 'starter-select' || view === 'turn-start' || view === 'reveal';

    // save progress
    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                version: 1, view, participants, matches,
                revealedIds: Array.from(revealedIds), historyLog, currentPlayerId,
            }));
        } catch (e) { /* storage unavailable: play without saving */ }
    }, [view, participants, matches, revealedIds, historyLog, currentPlayerId]);

    // keep the screen awake while the phone is being passed around
    useEffect(() => {
        if (!inPlay) return;
        let lock = null;
        const request = async () => {
            try { if ('wakeLock' in navigator) lock = await navigator.wakeLock.request('screen'); } catch (e) { /* not available */ }
        };
        request();
        const onVisible = () => { if (document.visibilityState === 'visible') request(); };
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            document.removeEventListener('visibilitychange', onVisible);
            try { if (lock) lock.release(); } catch (e) { /* ignore */ }
        };
    }, [inPlay]);

    const resetGame = () => {
        setMatches({}); setRevealedIds(new Set()); setHistoryLog([]); setCurrentPlayerId(null);
        setErrorMsg(null); setConfirm(null); setLogOpen(false); setView('setup');
    };

    const clearList = () => { setConfirm('clear'); };
    const doClearList = () => {
        setParticipants([]); setLinkingMode(false); setSelectedForLink(null); setErrorMsg(null); setConfirm(null);
    };

    const handleBulkAdd = (raw) => {
        const text = typeof raw === 'string' ? raw : bulkInput;
        if (!text.trim()) return;
        const lines = text.split(/[\n,]/).map((s) => s.trim()).filter((s) => s.length > 0);
        const seen = new Set(participants.map((x) => x.name.trim().toLowerCase()));
        const added = [];
        const skipped = [];
        lines.forEach((name) => {
            const key = name.toLowerCase();
            if (seen.has(key)) { skipped.push(name); return; }
            seen.add(key);
            added.push({ id: newId(), name, partnerId: null });
        });
        setParticipants((prev) => [...prev, ...added]);
        setBulkInput('');
        setErrorMsg(skipped.length > 0
            ? 'Skipped because the name is already in the list: ' + skipped.join(', ') + '. Add a surname or initial to tell people apart.'
            : null);
    };

    const updateName = (id, newName) => {
        const name = newName.trim();
        setEditingId(null);
        if (!name) return;
        const clash = participants.some((x) => x.id !== id && x.name.trim().toLowerCase() === name.toLowerCase());
        if (clash) {
            setErrorMsg('"' + name + '" is already in the list. Add a surname or initial to tell people apart.');
            return;
        }
        setErrorMsg(null);
        setParticipants((prev) => prev.map((x) => (x.id === id ? { ...x, name } : x)));
    };

    const removeParticipant = (id) => {
        setParticipants((prev) => {
            const gone = prev.find((x) => x.id === id);
            const rest = prev.filter((x) => x.id !== id);
            if (gone && gone.partnerId) return rest.map((x) => (x.id === gone.partnerId ? { ...x, partnerId: null } : x));
            return rest;
        });
    };

    const handleLinkClick = (id) => {
        if (!selectedForLink) { setSelectedForLink(id); return; }
        if (selectedForLink === id) { setSelectedForLink(null); return; }
        setParticipants((prev) => prev.map((x) => {
            if (x.id === id) return { ...x, partnerId: selectedForLink };
            if (x.id === selectedForLink) return { ...x, partnerId: id };
            if (x.partnerId === id || x.partnerId === selectedForLink) return { ...x, partnerId: null };
            return x;
        }));
        setSelectedForLink(null);
    };

    // Clears every partner link at once. Names and ids stay; only partnerId is reset,
    // so both sides of a couple can never end up out of sync.
    const unlinkAll = () => {
        setParticipants((prev) => prev.map((x) => ({ ...x, partnerId: null })));
        setSelectedForLink(null); setConfirm(null);
    };

    const unlinkPartner = (id) => {
        setParticipants((prev) => prev.map((x) => (x.id === id || x.partnerId === id ? { ...x, partnerId: null } : x)));
    };

    // One big loop: order[i] gives to order[i + 1], and the last gives to the first.
    const generateMatches = () => {
        setErrorMsg(null);
        if (participants.length < 3) { setErrorMsg('Add at least 3 friends so everyone fits in one loop.'); return; }
        const byId = {};
        participants.forEach((x) => { byId[x.id] = x; });
        for (let attempt = 0; attempt < 5000; attempt++) {
            const order = shuffle(participants.map((x) => x.id));
            let ok = true;
            for (let i = 0; i < order.length; i++) {
                const next = order[(i + 1) % order.length];
                if (byId[order[i]].partnerId === next) { ok = false; break; }
            }
            if (!ok) continue;
            const m = {};
            order.forEach((giverId, i) => { m[order[(i + 1) % order.length]] = giverId; });
            setMatches(m); setRevealedIds(new Set()); setHistoryLog([]); setCurrentPlayerId(null);
            setView('starter-select');
            return;
        }
        setErrorMsg('No loop keeps every couple apart. Try fewer couples or add more friends.');
    };

    const startGameWith = (id) => { setCurrentPlayerId(id); setView('turn-start'); };
    const surpriseMe = () => { startGameWith(participants[Math.floor(Math.random() * participants.length)].id); };

    // Record the opened gift, then pick who goes next: the giver if they have not opened yet (so the phone
    // follows the loop), otherwise a random person who is still waiting. After the last gift, show the summary.
    const nextTurn = () => {
        const giverId = matches[currentPlayerId];
        setHistoryLog((prev) => [...prev, { receiverId: currentPlayerId, giverId }]);
        const nextRevealed = new Set(revealedIds);
        nextRevealed.add(currentPlayerId);
        setRevealedIds(nextRevealed);
        if (nextRevealed.size === participants.length) { setView('summary'); return; }
        if (!nextRevealed.has(giverId)) {
            setCurrentPlayerId(giverId);
        } else {
            const remaining = participants.filter((x) => !nextRevealed.has(x.id));
            setCurrentPlayerId(remaining[Math.floor(Math.random() * remaining.length)].id);
        }
        setView('turn-start');
    };

    const player = participants.find((x) => x.id === currentPlayerId);
    const giver = player ? participants.find((x) => x.id === matches[player.id]) : null;
    const isLast = revealedIds.size + 1 === participants.length;
    const nextName = giver && !revealedIds.has(giver.id) ? giver.name : 'the next person';

    return (
        <div>
            <header className="topbar">
                <div className="topbar-in">
                    <div className="brand">
                        <span className="brand-mark"><Ico n="gift" size={22} /></span>
                        <span className="brand-name display">Lucky <b>Exchange</b></span>
                    </div>
                    {inGame && (
                        <div className="topbar-actions">
                            {view !== 'summary' && (
                                <button className="log-btn narrow-only" onClick={() => setLogOpen(true)} aria-label="Show who gives to whom">
                                    <Ico n="list" size={20} /> Gift log <span className="badge">{historyLog.length}/{participants.length}</span>
                                </button>
                            )}
                            <button className="icon-btn" onClick={() => setConfirm('restart')} aria-label="Restart game"><Ico n="reset" /></button>
                        </div>
                    )}
                </div>
            </header>

            <main className={'shell' + (view === 'setup' || view === 'turn-start' ? ' has-dock' : '')}>
                {view === 'setup' && (
                    <SetupView
                        bulkInput={bulkInput} setBulkInput={setBulkInput} handleBulkAdd={handleBulkAdd} errorMsg={errorMsg}
                        participants={participants} linkingMode={linkingMode} setLinkingMode={setLinkingMode}
                        selectedForLink={selectedForLink} setSelectedForLink={setSelectedForLink} handleLinkClick={handleLinkClick}
                        editingId={editingId} editNameVal={editNameVal} setEditNameVal={setEditNameVal} setEditingId={setEditingId}
                        updateName={updateName} unlinkPartner={unlinkPartner} removeParticipant={removeParticipant}
                        generateMatches={generateMatches} clearList={clearList} askUnlinkAll={() => setConfirm('unlink-all')} />
                )}

                {inGame && (
                    <div className={'game-grid' + (view !== 'summary' ? ' with-side' : '')}>
                        <div style={{ minWidth: 0 }}>
                            {view === 'starter-select' && (
                                <div className="narrow">
                                    <div className="card">
                                        <h2 className="title">Who goes first?</h2>
                                        <p className="sub">Pick anyone. The phone then follows the loop, so you will always know who is next.</p>
                                        <button className="btn btn-primary btn-block" onClick={surpriseMe}><Ico n="sparkles" size={20} /> Surprise me</button>
                                    </div>
                                    <div className="starter-grid">
                                        {participants.map((x) => (
                                            <button key={x.id} className="starter" onClick={() => startGameWith(x.id)}>
                                                <Avatar name={x.name} size={52} />
                                                <span className="n">{x.name}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {view === 'turn-start' && player && (
                                <div className="narrow">
                                    <div className="progress" role="progressbar" aria-label="Gifts opened" aria-valuemin={0} aria-valuemax={participants.length} aria-valuenow={revealedIds.size}>
                                        <i style={{ width: Math.round((revealedIds.size / participants.length) * 100) + '%' }} />
                                    </div>
                                    <p className="eyebrow">{isLast ? 'Final gift' : 'Gift ' + (revealedIds.size + 1) + ' of ' + participants.length}</p>
                                    <div className="turn">
                                        <p>Please pass the phone to <span className="th">(ส่งโทรศัพท์ให้)</span></p>
                                        <h1 className="display">{player.name}</h1>
                                    </div>
                                    <div className="dock">
                                        <div className="dock-in">
                                            <p className="privacy"><Ico n="eyeOff" size={18} /> Only tap if you are {player.name}. Everyone else, look away (หันหน้าไป).</p>
                                            <button className="btn btn-primary btn-block" onClick={() => setView('reveal')}>
                                                <Ico n="gift" size={22} /> I am {player.name}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {view === 'reveal' && player && (
                                <RevealView key={player.id} player={player} giver={giver} nextName={nextName} isLast={isLast} onNext={nextTurn} />
                            )}

                            {view === 'summary' && (
                                <div className="narrow">
                                    <div className="card done">
                                        <h2 className="title">All gifts opened</h2>
                                        <p className="sub">Everyone knows who is giving to them. The full list is below.</p>
                                        <SummaryActions historyLog={historyLog} participants={participants} onReplay={resetGame} />
                                    </div>
                                    <div className="card flush">
                                        <LogBody historyLog={historyLog} participants={participants} showCopy={false} />
                                    </div>
                                </div>
                            )}
                        </div>

                        {view !== 'summary' && (
                            <aside className="side">
                                <div className="card"><LogBody historyLog={historyLog} participants={participants} /></div>
                            </aside>
                        )}
                    </div>
                )}
            </main>

            {inGame && view !== 'reveal' && view !== 'summary' && (
                <LogSheet open={logOpen} onClose={() => setLogOpen(false)} historyLog={historyLog} participants={participants} />
            )}

            {confirm === 'restart' && (
                <ConfirmModal title="Restart the game?" text="The draw and all opened gifts will be cleared. Your list of friends stays."
                    confirmLabel="Restart" onCancel={() => setConfirm(null)} onConfirm={resetGame} />
            )}
            {confirm === 'unlink-all' && (
                <ConfirmModal title="Unlink all couples?" text="Everyone stays in the list. Only the couple links are removed."
                    confirmLabel="Unlink all" onCancel={() => setConfirm(null)} onConfirm={unlinkAll} />
            )}
            {confirm === 'clear' && (
                <ConfirmModal title="Clear the list?" text="Everyone will be removed from the list."
                    confirmLabel="Clear list" onCancel={() => setConfirm(null)} onConfirm={doClearList} />
            )}
        </div>
    );
};

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
