import React, { useEffect, useRef, useState } from "react";
import { echarts, buildOption } from "@/lib/charts";

// An interactive ECharts chart. It is created only once it scrolls near the
// screen, so a page of fourteen charts stays quick on phones.
export default function Chart({ plot, className }) {
  const ref = useRef(null);
  const chartRef = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setVisible(true), { rootMargin: "400px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    const chart = echarts.init(ref.current, null, { renderer: "canvas" });
    chartRef.current = chart;
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(ref.current);
    return () => {
      ro.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, [visible]);

  useEffect(() => {
    chartRef.current?.setOption(buildOption(plot), { notMerge: true });
  }, [plot, visible]);

  return <div ref={ref} className={className} />;
}
