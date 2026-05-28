type PostCssConfig = {
  plugins: Record<string, unknown>
}

const config: PostCssConfig = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
}

export default config
