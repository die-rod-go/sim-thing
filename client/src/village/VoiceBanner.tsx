import { useEffect, useState } from "react";
import { clientConfig } from "../client-config";

interface VoiceBannerProps {
  /** The last words spoken from the sky; a new object shows the banner again. */
  voice: { words: string; tick: number } | null;
}

/** Shows what the village just heard from the sky, for a while. */
export function VoiceBanner({ voice }: VoiceBannerProps) {
  const [shownVoice, setShownVoice] = useState(voice);
  useEffect(() => {
    setShownVoice(voice);
    if (voice === null) return;
    const timer = window.setTimeout(
      () => setShownVoice(null),
      clientConfig.village.voiceBannerLifetimeMs,
    );
    return () => window.clearTimeout(timer);
  }, [voice]);
  if (shownVoice === null) return null;
  return (
    <div className="voice-banner" role="status" onClick={() => setShownVoice(null)}>
      <span className="voice-banner-label">A voice from the sky</span>
      <span className="voice-banner-words">“{shownVoice.words}”</span>
    </div>
  );
}
