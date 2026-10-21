import Plotly from "plotly.js-basic-dist-min";
import createPlotlyComponent from "react-plotly.js/factory";
import { confidenceColor, OVERFLOW_LABEL } from "../../lib/monteCarlo/confidence";
import type { Histogram, ResultRow } from "../../lib/monteCarlo/types";

const Plot = createPlotlyComponent(Plotly);

// Port of the legacy results.html Plotly chart. The x axis is categorical
// ("1".."50", ">50"), so the non-convergence bucket is its own bar.
// Default export so ResultsPage can lazy-load Plotly.
export default function HistogramChart({
  histogram,
  rows,
}: {
  histogram: Histogram;
  rows: ResultRow[];
}) {
  const markers = rows.map((row) => ({
    label: `P${row.confidence}`,
    x: row.exceeds_window ? OVERFLOW_LABEL : String(row.sprints),
    color: confidenceColor(row.confidence),
  }));

  return (
    <Plot
      className="h-full w-full"
      useResizeHandler
      data={[
        {
          x: histogram.labels,
          y: histogram.counts,
          type: "bar",
          marker: { color: "#4E98D1" },
          hovertemplate: "%{y}<extra></extra>",
        },
      ]}
      layout={{
        autosize: true,
        paper_bgcolor: "#0f172a",
        plot_bgcolor: "#0f172a",
        font: { color: "#e2e8f0" },
        margin: { t: 40, r: 20, b: 60, l: 50 },
        xaxis: { title: { text: "Sprints to Reach Target" }, tickangle: -45, type: "category" },
        yaxis: { title: { text: "Simulation Count" } },
        shapes: markers.map((marker) => ({
          type: "line",
          xref: "x",
          x0: marker.x,
          x1: marker.x,
          yref: "paper",
          y0: 0,
          y1: 1,
          line: { color: marker.color, width: 2, dash: "dash" },
        })),
        annotations: markers.map((marker, index) => ({
          x: marker.x,
          y: 1,
          yref: "paper",
          yanchor: "bottom",
          yshift: (index % 2) * 16,
          showarrow: false,
          text: marker.label,
          font: { color: marker.color, size: 11 },
        })),
      }}
      config={{ displayModeBar: false, responsive: true }}
    />
  );
}
