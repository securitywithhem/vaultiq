import js from "@eslint/js";

export default [
    js.configs.recommended,
    {
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "module",
            globals: {
                console: "readonly",
                process: "readonly",
                __dirname: "readonly",
                Buffer: "readonly",
                module: "readonly",
                require: "readonly",
                setTimeout: "readonly",
                setInterval: "readonly",
                clearTimeout: "readonly",
                clearInterval: "readonly",
                URL: "readonly",
                fetch: "readonly"
            }
        },
        rules: {
            "no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }]
        }
    },
    {
        files: ["tests/**/*.js"],
        languageOptions: {
            globals: {
                jest: "readonly",
                describe: "readonly",
                it: "readonly",
                test: "readonly",
                expect: "readonly",
                beforeAll: "readonly",
                beforeEach: "readonly",
                afterAll: "readonly",
                afterEach: "readonly"
            }
        }
    }
];
