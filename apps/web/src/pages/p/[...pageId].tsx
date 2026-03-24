import dynamic from "next/dynamic";

// Lazy load to keep parity with other public routes
const PublicPageView = dynamic(() => import("../../views/public/page"), {
  ssr: false,
});

export default function PublicPageRoute() {
  return <PublicPageView />;
}
