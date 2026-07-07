import { m } from "motion/react";
export function LoadingScreen() {
  return (
    <div>
      {" "}
      <m.div
        animate={{ rotate: 360 }}
        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
      />{" "}
    </div>
  );
}
