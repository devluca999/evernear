import React from "react";
import { useVideoConfig } from "remotion";
import { Caption, Micro, Stage } from "../components/ui";
import { useT } from "../components/useT";
import { color, enter } from "../theme";

export type Layout = "wide" | "tall" | "square";

export const useLayout = (): { layout: Layout; u: number } => {
  const { width, height } = useVideoConfig();
  if (width > height) return { layout: "wide", u: width / 1920 };
  if (height > width) return { layout: "tall", u: (width / 1080) * 1.4 };
  return { layout: "square", u: width / 1080 };
};

/** Eyebrow + headline at the top, content below, optional burned-in caption at the bottom. */
export const SceneFrame: React.FC<{
  eyebrow?: string;
  headline: React.ReactNode;
  caption?: string;
  children?: React.ReactNode;
  contentWidth?: number;
}> = ({ eyebrow, headline, caption, children, contentWidth }) => {
  const t = useT();
  const { layout, u } = useLayout();
  const tall = layout === "tall";
  const square = layout === "square";
  const pad = tall ? 80 : square ? 90 * u : 120 * u;
  return (
    <Stage>
      <div
        style={{
          position: "absolute",
          inset: 0,
          padding: tall ? `${150}px ${pad}px ${300}px` : square ? `${80 * u}px ${pad}px ${150 * u}px` : `${90 * u}px ${pad}px ${170 * u}px`,
          display: "flex",
          flexDirection: "column",
          gap: (tall ? 40 : 40 * u),
        }}
      >
        <div style={enter(t, 0)}>
          {eyebrow ? <Micro u={tall ? 1.5 : u * 1.1}>{eyebrow}</Micro> : null}
          <div
            style={{
              fontSize: tall ? 84 : square ? 60 * u : 72 * u,
              fontWeight: 600,
              letterSpacing: tall ? -1.5 : -1.5 * u,
              lineHeight: 1.08,
              marginTop: 14 * (tall ? 1 : u),
              color: color.text,
              maxWidth: tall ? undefined : 1500 * u,
            }}
          >
            {headline}
          </div>
        </div>
        <div style={{ flex: 1, display: "flex", alignItems: tall || square ? "flex-start" : "center", justifyContent: "center", minHeight: 0 }}>
          <div style={{ width: "100%", maxWidth: contentWidth ? contentWidth * u : undefined }}>{children}</div>
        </div>
      </div>
      {caption ? <Caption text={caption} u={tall ? 1.35 : u} opacity={enter(t, 12).opacity} bottom={tall ? 130 : undefined} /> : null}
    </Stage>
  );
};
