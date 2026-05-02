export default [
  {
    ignores: [
      ".ai-workflow/**",
      "coverage/**",
      "dogfood-projects/**",
      "node_modules/**",
      "tests/fixtures/**",
      "runtime/web/tutorial/vendor/**"
    ]
  },
  {
    files: ["**/*.ts", "**/*.ts"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        AbortController: "readonly",
        Buffer: "readonly",
        console: "readonly",
        fetch: "readonly",
        globalThis: "readonly",
        process: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        URL: "readonly"
      }
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-undef": "error"
    }
  }
];
