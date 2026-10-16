// The graph page loads the constellation, the search results and the graph view with React.lazy. In a test the first
// import also pays for Vite's transform of that module graph, which on a busy machine outlasts a Testing Library wait.
// A test file that opens one of those views imports it up front in beforeAll, so the wait only covers rendering.
export const preloadConstellation = () => import('../features/constellation/ConstellationView.tsx')
export const preloadGraphView = () => import('../features/graph/GraphView.tsx')
