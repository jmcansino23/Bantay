export default function manifest() {
  return {
    name: "Bantay",
    short_name: "Bantay",
    description: "Keeps watch over your important bank alerts, deliveries, bills and credit card dues.",
    start_url: "/",
    display: "standalone",
    background_color: "#f3f5f4",
    theme_color: "#3f4fb0",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
