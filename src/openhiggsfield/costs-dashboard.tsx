"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";

import { getCostSessions, removeCostSession } from "@/generation/cost-actions";
import type { CostSession, DailyCost } from "@/generation/session-store";

function brl(micros: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(micros / 1_000_000);
}

function number(value: number) {
  return new Intl.NumberFormat("pt-BR").format(value);
}

function dayLabel(day: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "full", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`));
}

function timeLabel(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "America/Sao_Paulo" }).format(new Date(value));
}

export function CostsDashboard({ initialDays }: { initialDays: DailyCost[] }) {
  const [days, setDays] = useState(initialDays);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [sessions, setSessions] = useState<CostSession[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const total = useMemo(() => days.reduce((sum, day) => sum + day.brlMicros, 0), [days]);

  useEffect(() => {
    if (!selectedDay) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedDay(null);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [selectedDay]);

  const openDay = (day: string) => {
    setSelectedDay(day);
    setSessions([]);
    setError(null);
    startTransition(async () => {
      try {
        setSessions(await getCostSessions(day));
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Could not load sessions");
      }
    });
  };

  const remove = (session: CostSession) => {
    if (!window.confirm(`Delete session #${session.id} and its stored output?`)) return;
    startTransition(async () => {
      try {
        await removeCostSession(session.id);
        setSessions((current) => current.filter((item) => item.id !== session.id));
        setDays((current) => current.flatMap((day) => {
          if (day.day !== selectedDay) return [day];
          const nextSessions = day.sessions - 1;
          if (nextSessions <= 0) return [];
          return [{
            ...day,
            sessions: nextSessions,
            tokens: Math.max(0, day.tokens - session.totalTokens),
            brlMicros: Math.max(0, day.brlMicros - session.brlMicros),
          }];
        }));
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Could not delete session");
      }
    });
  };

  return (
    <>
      <section className="costs-summary" aria-label="Total estimated cost">
        <span>Total estimated</span>
        <strong>{brl(total)}</strong>
        <small>Calculated from Google model usage and the latest available PTAX sell rate.</small>
      </section>

      <section className="costs-list" aria-label="Daily costs">
        {days.length === 0 ? (
          <div className="costs-empty">No generation sessions yet.</div>
        ) : days.map((day) => (
          <button type="button" className="cost-day" key={day.day} onClick={() => openDay(day.day)}>
            <span><strong>{dayLabel(day.day)}</strong><small>{day.sessions} {day.sessions === 1 ? "session" : "sessions"}</small></span>
            <span><strong>{brl(day.brlMicros)}</strong><small>{number(day.tokens)} tokens</small></span>
          </button>
        ))}
      </section>

      <p className="costs-note">Values are estimates, not a Google invoice. Veo is billed by generated seconds, so its sessions show seconds and zero tokens.</p>

      {selectedDay && (
        <div className="cost-modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setSelectedDay(null);
        }}>
          <section className="cost-modal" role="dialog" aria-modal="true" aria-labelledby="cost-dialog-title">
            <header>
              <div><p>Sessions</p><h2 id="cost-dialog-title">{dayLabel(selectedDay)}</h2></div>
              <button type="button" className="cost-close" onClick={() => setSelectedDay(null)} aria-label="Close">×</button>
            </header>
            {pending && sessions.length === 0 ? <div className="cost-loading">Loading sessions…</div> : null}
            {error ? <div className="cost-error" role="alert">{error}</div> : null}
            <div className="cost-session-list">
              {sessions.map((session) => (
                <article className="cost-session" key={session.id}>
                  <div className="cost-session-title">
                    <span>#{session.id} · {timeLabel(session.createdAt)}</span>
                    <strong>{session.title}</strong>
                    <small>{session.modelLabel} · {session.status}</small>
                  </div>
                  <div className="cost-session-metrics">
                    <span>{session.unitLabel === "seconds" ? `${session.billableUnits}s · ${number(session.totalTokens)} tokens` : `${number(session.totalTokens)} tokens`}</span>
                    <strong>{brl(session.brlMicros)}</strong>
                  </div>
                  <div className="cost-session-actions">
                    <Link href={`/?session=${encodeURIComponent(session.requestId)}`}>Back to session</Link>
                    <button type="button" disabled={pending} onClick={() => remove(session)}>Delete</button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
