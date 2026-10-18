import { BarChart, GaugeChart, HeatmapChart, LineChart } from 'echarts/charts'
import {
  BrushComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TooltipComponent,
  VisualMapComponent,
} from 'echarts/components'
import * as echarts from 'echarts/core'
import { SVGRenderer } from 'echarts/renderers'

// LEARN: LG-04 echarts-tree-shaking | echarts/core starts empty and use() adds only the chart types and components the status page draws, so the lazy chunk holds a fraction of the library; the SVG renderer makes every mark a DOM element, which the accessibility tree and the tests can read, where the canvas would be one opaque bitmap
echarts.use([
  LineChart,
  BarChart,
  HeatmapChart,
  GaugeChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  BrushComponent,
  VisualMapComponent,
  MarkLineComponent,
  SVGRenderer,
])

export { echarts }
