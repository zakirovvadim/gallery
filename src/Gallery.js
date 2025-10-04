import React, { useEffect, useMemo, useState } from "react";
const API = (process.env.REACT_APP_API_BASE || "").replace(/\/+$/, "");
/** Мини-галерея с «папками по датам»
 *  - Берём фото из /api/photos (или мок, если API нет)
 *  - Парсим дату из takenAt или имени файла: YYYY[-_]?MM[-_]?DD([-_]HH[-_]?mm([-_]?ss)?)
 *  - Слева дерево Год→Месяц→День, справа сетка миниатюр
 *  - Лайтбокс по клику (стрелки ←/→, Esc)
 */
export default function Gallery() {
    const [photos, setPhotos] = useState([]);
    const [loading, setLoading] = useState(true);

    // выбранные «папки»
    const [year, setYear] = useState(null);
    const [month, setMonth] = useState(null); // 1..12
    const [day, setDay] = useState(null);     // 1..31

    // лайтбокс
    const [lbIndex, setLbIndex] = useState(null);

    useEffect(() => {
        fetch(`${API}/api/photos`)
            .then(r => r.ok ? r.json() : Promise.reject(r.status))
            .then(list => {
                setPhotos(Array.isArray(list) ? list : []);
                setLoading(false);
            })
            .catch(() => {
                // мок если API нет
                const now = new Date();
                const mock = [...Array(36)].map((_, i) => {
                    const d = new Date(now.getTime() - i * 86400000);
                    const y = d.getFullYear();
                    const m = String(d.getMonth() + 1).padStart(2, "0");
                    const dd = String(d.getDate()).padStart(2, "0");
                    const hh = String(d.getHours()).padStart(2, "0");
                    const mm = String(d.getMinutes()).padStart(2, "0");
                    const ss = String(d.getSeconds()).padStart(2, "0");
                    const name = `${y}-${m}-${dd}_${hh}-${mm}-${ss}_cat_${i}.jpg`;
                    const id = (i * 17) % 1000;
                    return {
                        filename: name,
                        url: `https://picsum.photos/id/${id}/1200/800`,
                        thumbUrl: `https://picsum.photos/id/${id}/300/300`,
                        takenAt: d.toISOString()
                    };
                });
                setPhotos(mock);
                setLoading(false);
            });
    }, []);

    // нормализуем (вычислим год/месяц/день)
    const normalized = useMemo(() => {
        return photos.map(p => {
            const dt = parseDate(p.takenAt, p.filename);
            return {
                ...p,
                _date: dt || null,
                _year: dt?.getFullYear() ?? null,
                _month: dt ? dt.getMonth() + 1 : null,
                _day: dt?.getDate() ?? null
            };
        }).sort((a, b) => {
            const ta = a._date ? a._date.getTime() : 0;
            const tb = b._date ? b._date.getTime() : 0;
            return tb - ta; // новые сверху
        });
    }, [photos]);

    // дерево дат
    const tree = useMemo(() => buildTree(normalized), [normalized]);

    // применяем фильтры
    const filtered = useMemo(() => {
        return normalized.filter(p =>
            (year  ? p._year  === year  : true) &&
            (month ? p._month === month : true) &&
            (day   ? p._day   === day   : true)
        );
    }, [normalized, year, month, day]);

    const openLb = (i) => setLbIndex(i);
    const closeLb = () => setLbIndex(null);

    return (
        <div className="wrap">
            <header className="topbar">
                <h1>Simbalay gallery</h1>
                <div className="spacer" />
                <button className="btn" onClick={() => { setYear(null); setMonth(null); setDay(null); }}>
                    Сбросить
                </button>
                {loading && <span className="muted">Загрузка…</span>}
            </header>

            <main className="layout">
                <aside className="sidebar">
                    <DateTree
                        tree={tree}
                        selected={{ year, month, day }}
                        onYear={y => { setYear(y === year ? null : y); setMonth(null); setDay(null); }}
                        onMonth={m => { setMonth(m === month ? null : m); setDay(null); }}
                        onDay={d => { setDay(d === day ? null : d); }}
                    />
                </aside>

                <section className="grid">
                    {!filtered.length && !loading && (
                        <div className="empty">Нет фото под выбранные фильтры</div>
                    )}
                    {filtered.map((p, i) => (
                        <figure key={(p.id ?? p.url) + i} className="card" onClick={() => openLb(i)}>
                            <img
                                src={p.thumbUrl || p.url}
                                alt={p.filename}
                                loading="lazy"
                            />
                            <figcaption>
                                <span className="name" title={p.filename}>{p.filename}</span>
                                {p._date && <time>{fmtYMD(p._date)}</time>}
                            </figcaption>
                        </figure>
                    ))}
                </section>
            </main>

            {lbIndex != null && (
                <Lightbox items={filtered} index={lbIndex} onClose={closeLb} setIndex={i => setLbIndex(i)} />
            )}
        </div>
    );
}

// ====== Вспомогательные компоненты/функции ======

function DateTree({ tree, selected, onYear, onMonth, onDay }) {
    const years = Object.keys(tree).map(Number).sort((a,b) => b - a);
    return (
        <div>
            <h3 className="treeTitle">Папки по датам</h3>
            {years.length === 0 && <div className="muted">Нет данных</div>}

            {years.map(y => {
                const months = Object.keys(tree[y] || {}).map(Number).sort((a,b) => b - a);
                const yOpen = selected.year === y;
                return (
                    <div className="treeBlock" key={y}>
                        <button className={"treeRow " + (yOpen ? "active" : "")} onClick={() => onYear(y)}>
                            <span className="chev">{yOpen ? "▾" : "▸"}</span>{y}
                            <span className="count">{countDeep(tree[y])}</span>
                        </button>
                        {yOpen && (
                            <div className="treeInner">
                                {months.map(m => {
                                    const days = Object.keys(tree[y][m] || {}).map(Number).sort((a,b) => b - a);
                                    const mOpen = selected.month === m;
                                    return (
                                        <div className="treeBlock" key={`${y}-${m}`}>
                                            <button className={"treeRow sub " + (mOpen ? "active" : "")} onClick={() => onMonth(m)}>
                                                <span className="chev">{mOpen ? "▾" : "▸"}</span>{fmtMonth(m)}
                                                <span className="count">{countDeep(tree[y][m])}</span>
                                            </button>
                                            {mOpen && (
                                                <div className="treeDays">
                                                    {days.map(d => (
                                                        <button
                                                            key={`${y}-${m}-${d}`}
                                                            className={"day " + (selected.day === d ? "active" : "")}
                                                            onClick={() => onDay(d)}
                                                        >
                                                            {String(d).padStart(2,"0")} <span className="count">{tree[y][m][d]}</span>
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

function Lightbox({ items, index, setIndex, onClose }) {
    const cur = items[index];
    const hasPrev = index > 0;
    const hasNext = index < items.length - 1;

    React.useEffect(() => {
        const h = (e) => {
            if (e.key === "Escape") onClose();
            if (e.key === "ArrowLeft" && hasPrev) setIndex(index - 1);
            if (e.key === "ArrowRight" && hasNext) setIndex(index + 1);
        };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [index, hasPrev, hasNext, onClose, setIndex]);

    return (
        <div className="lb" role="dialog" aria-modal onClick={onClose}>
            <div className="lbInner" onClick={e => e.stopPropagation()}>
                <img
                    src={cur.url}
                    alt={cur.filename}
                    onError={e => {
                        const p = items[index];
                        if (p?.thumbUrl && e.currentTarget.dataset.fbk !== "1") {
                            e.currentTarget.dataset.fbk = "1";
                            e.currentTarget.src = p.thumbUrl;
                        }
                    }}
                />
                <div className="lbBar">
                    <div className="truncate">{cur.filename}</div>
                    {cur._date && <time>{fmtFull(cur._date)}</time>}
                </div>
                <button className="lbClose" onClick={onClose}>✕</button>
                <button className="lbNav left" disabled={!hasPrev} onClick={() => setIndex(index - 1)}>←</button>
                <button className="lbNav right" disabled={!hasNext} onClick={() => setIndex(index + 1)}>→</button>
            </div>
        </div>
    );
}

function parseDate(takenAt, filename) {
    if (takenAt) {
        const d = new Date(takenAt);
        if (!isNaN(d.getTime())) return d;
    }
    const re = /(?<y>20\d{2}|19\d{2})[-_]?(\d{2})[-_]?(\d{2})(?:[-_](\d{2})[-_]?(\d{2})(?:[-_]?(\d{2}))?)?/;
    const m = (filename || "").match(re);
    if (!m) return null;
    const y = +m[1], mo = +m[2], d = +m[3];
    const H = m[4] ? +m[4] : 12, M = m[5] ? +m[5] : 0, S = m[6] ? +m[6] : 0;
    const dt = new Date(Date.UTC(y, mo - 1, d, H, M, S));
    return isNaN(dt.getTime()) ? null : dt;
}

function buildTree(list) {
    const t = {};
    for (const p of list) {
        if (!p._year || !p._month || !p._day) continue;
        t[p._year] ??= {};
        t[p._year][p._month] ??= {};
        t[p._year][p._month][p._day] ??= 0;
        t[p._year][p._month][p._day]++;
    }
    return t;
}
const countDeep = (node) =>
    typeof node === "number" ? node :
        Object.values(node || {}).reduce((s, v) => s + countDeep(v), 0);

const fmtYMD = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2,"0");
    const day = String(d.getDate()).padStart(2,"0");
    return `${y}-${m}-${day}`;
};
const fmtFull = (d) => `${fmtYMD(d)} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}:${String(d.getSeconds()).padStart(2,"0")}`;
const fmtMonth = (m) => new Date(2000, m - 1, 1).toLocaleString(undefined, { month: "long" });
