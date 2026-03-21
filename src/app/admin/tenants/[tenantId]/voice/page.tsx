"use client";

import { use, useEffect, useState, useRef } from "react";
import Link from "next/link";

type Voice = {
  voice_id: string;
  name: string;
  category: string;
  description: string | null;
  preview_url: string | null;
  labels: Record<string, string>;
};

export default function VoicePage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = use(params);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string | null>(null);
  const [savedVoiceId, setSavedVoiceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    Promise.all([
      fetch(`/api/elevenlabs/voices`).then((r) => r.json()),
      fetch(`/api/tenants/${tenantId}/voice`).then((r) => r.json()),
    ]).then(([voicesData, voiceData]) => {
      setVoices(voicesData.voices ?? []);
      setSelectedVoiceId(voiceData.voiceId ?? null);
      setSavedVoiceId(voiceData.voiceId ?? null);
      setLoading(false);
    });
  }, [tenantId]);

  function playPreview(voice: Voice) {
    if (!voice.preview_url) return;

    if (playingId === voice.voice_id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }

    if (audioRef.current) audioRef.current.pause();
    const audio = new Audio(voice.preview_url);
    audioRef.current = audio;
    setPlayingId(voice.voice_id);
    audio.play();
    audio.onended = () => setPlayingId(null);
  }

  async function save() {
    setSaving(true);
    await fetch(`/api/tenants/${tenantId}/voice`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voiceId: selectedVoiceId }),
    });
    setSavedVoiceId(selectedVoiceId);
    setSaving(false);
  }

  const grouped: Record<string, Voice[]> = {};
  for (const v of voices) {
    const cat = v.category || "premade";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(v);
  }

  const categoryOrder = ["premade", "professional", "cloned", "generated"];
  const categoryLabels: Record<string, string> = {
    premade: "Premade Voices",
    professional: "Professional Voices",
    cloned: "Cloned Voices",
    generated: "Generated Voices",
  };

  return (
    <div className="container">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ marginBottom: 6 }}>Voice Settings</h1>
          <div style={{ color: "var(--muted)", fontSize: 13 }}>
            Choose the voice the bot uses to reply to voice messages on WhatsApp, SMS, and Slack.
          </div>
        </div>
        <Link className="btn" href={`/admin/tenants/${tenantId}`}>Back to tenant</Link>
      </div>

      <div style={{ height: 16 }} />

      {loading ? <div style={{ color: "var(--muted)" }}>Loading voices...</div> : null}

      {!loading && (
        <>
          {categoryOrder
            .filter((cat) => grouped[cat]?.length)
            .map((cat) => (
              <div key={cat} style={{ marginBottom: 24 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10, color: "var(--muted)" }}>
                  {categoryLabels[cat] ?? cat}
                </h3>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10 }}>
                  {grouped[cat].map((v) => {
                    const isSelected = selectedVoiceId === v.voice_id;
                    const accent = v.labels?.accent;
                    const gender = v.labels?.gender;
                    const age = v.labels?.age;
                    const useCase = v.labels?.use_case ?? v.labels?.["use case"];

                    return (
                      <div
                        key={v.voice_id}
                        onClick={() => setSelectedVoiceId(v.voice_id)}
                        className="card"
                        style={{
                          padding: 14,
                          cursor: "pointer",
                          border: isSelected ? "2px solid var(--brand)" : "1px solid var(--border)",
                          background: isSelected ? "rgba(99,102,241,0.06)" : undefined,
                          transition: "border 0.15s, background 0.15s",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
                              {v.name}
                              {isSelected ? (
                                <span style={{ marginLeft: 8, fontSize: 10, color: "var(--brand)", fontWeight: 700 }}>SELECTED</span>
                              ) : null}
                            </div>
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
                              {gender ? <Tag>{gender}</Tag> : null}
                              {age ? <Tag>{age}</Tag> : null}
                              {accent ? <Tag>{accent}</Tag> : null}
                              {useCase ? <Tag color="var(--brand)">{useCase}</Tag> : null}
                            </div>
                            {v.description ? (
                              <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: "1.4" }}>
                                {v.description.slice(0, 100)}{v.description.length > 100 ? "..." : ""}
                              </div>
                            ) : null}
                          </div>

                          {v.preview_url ? (
                            <button
                              onClick={(e) => { e.stopPropagation(); playPreview(v); }}
                              style={{
                                width: 36,
                                height: 36,
                                borderRadius: "50%",
                                border: "1px solid var(--border)",
                                background: playingId === v.voice_id ? "var(--brand)" : "transparent",
                                color: playingId === v.voice_id ? "white" : "var(--muted)",
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 16,
                                flexShrink: 0,
                              }}
                            >
                              {playingId === v.voice_id ? "\u25A0" : "\u25B6"}
                            </button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

          <div style={{ position: "sticky", bottom: 0, padding: "16px 0", background: "var(--bg)", borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12 }}>
            <button
              className="btn"
              onClick={save}
              disabled={saving || selectedVoiceId === savedVoiceId}
              style={{ opacity: selectedVoiceId === savedVoiceId ? 0.5 : 1 }}
            >
              {saving ? "Saving..." : "Save Voice Selection"}
            </button>
            {selectedVoiceId !== savedVoiceId ? (
              <span style={{ fontSize: 12, color: "var(--brand)" }}>Unsaved changes</span>
            ) : savedVoiceId ? (
              <span style={{ fontSize: 12, color: "var(--muted)" }}>
                Active: {voices.find((v) => v.voice_id === savedVoiceId)?.name ?? savedVoiceId}
              </span>
            ) : (
              <span style={{ fontSize: 12, color: "var(--muted)" }}>No voice selected (voice replies disabled)</span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Tag({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <span style={{
      padding: "1px 6px",
      borderRadius: 4,
      fontSize: 10,
      fontWeight: 600,
      letterSpacing: "0.03em",
      background: color ? `${color}15` : "rgba(255,255,255,0.06)",
      color: color ?? "var(--muted)",
      border: `1px solid ${color ? `${color}30` : "rgba(255,255,255,0.08)"}`,
    }}>
      {children}
    </span>
  );
}
