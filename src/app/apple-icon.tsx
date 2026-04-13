import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        background:
          "linear-gradient(145deg, #1e1b4b 0%, #312e81 50%, #4f46e5 100%)",
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "10px",
      }}
    >
      {/* Candlesticks */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: "7px",
          height: "58px",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <div
            style={{
              width: "3px",
              height: "8px",
              background: "rgba(248,113,113,0.7)",
              borderRadius: "2px",
            }}
          />
          <div
            style={{
              width: "13px",
              height: "18px",
              background: "#f87171",
              borderRadius: "3px",
            }}
          />
          <div
            style={{
              width: "3px",
              height: "6px",
              background: "rgba(248,113,113,0.7)",
              borderRadius: "2px",
            }}
          />
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <div
            style={{
              width: "3px",
              height: "10px",
              background: "rgba(52,211,153,0.7)",
              borderRadius: "2px",
            }}
          />
          <div
            style={{
              width: "13px",
              height: "28px",
              background: "#34d399",
              borderRadius: "3px",
            }}
          />
          <div
            style={{
              width: "3px",
              height: "5px",
              background: "rgba(52,211,153,0.7)",
              borderRadius: "2px",
            }}
          />
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <div
            style={{
              width: "3px",
              height: "8px",
              background: "rgba(52,211,153,0.7)",
              borderRadius: "2px",
            }}
          />
          <div
            style={{
              width: "13px",
              height: "40px",
              background: "#34d399",
              borderRadius: "3px",
            }}
          />
          <div
            style={{
              width: "3px",
              height: "4px",
              background: "rgba(52,211,153,0.7)",
              borderRadius: "2px",
            }}
          />
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <div
            style={{
              width: "3px",
              height: "6px",
              background: "rgba(248,113,113,0.7)",
              borderRadius: "2px",
            }}
          />
          <div
            style={{
              width: "13px",
              height: "14px",
              background: "#f87171",
              borderRadius: "3px",
            }}
          />
          <div
            style={{
              width: "3px",
              height: "8px",
              background: "rgba(248,113,113,0.7)",
              borderRadius: "2px",
            }}
          />
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <div
            style={{
              width: "3px",
              height: "9px",
              background: "rgba(52,211,153,0.7)",
              borderRadius: "2px",
            }}
          />
          <div
            style={{
              width: "13px",
              height: "32px",
              background: "#34d399",
              borderRadius: "3px",
            }}
          />
          <div
            style={{
              width: "3px",
              height: "5px",
              background: "rgba(52,211,153,0.7)",
              borderRadius: "2px",
            }}
          />
        </div>
      </div>
      {/* Brand */}
      <div
        style={{
          display: "flex",
          fontSize: "42px",
          fontWeight: "900",
          letterSpacing: "-2px",
          fontFamily: "system-ui, sans-serif",
          lineHeight: 1,
        }}
      >
        <span style={{ color: "#a5b4fc" }}>M</span>
        <span style={{ color: "#34d399" }}>P</span>
      </div>
    </div>,
    { ...size },
  );
}
