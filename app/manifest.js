export default function manifest() {
  return {
    name: "Battle Crown Personal Command Center",
    short_name: "Crown Command",
    description: "Personal, biometric-protected Battle Crown command center.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#0b0f17",
    theme_color: "#0b0f17",
    icons: [
      {
        src: "/favicon.ico",
        sizes: "any",
        type: "image/x-icon",
      },
    ],
  };
}
