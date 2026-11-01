// Il tsconfig del main non include i tipi `vite/client`: dichiara l'import `?raw` dei file Markdown.
declare module '*.md?raw' {
  const contenuto: string
  export default contenuto
}
