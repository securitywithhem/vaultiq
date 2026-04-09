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
                setInterval: "readonly"
            }
        },
        rules: {
            "no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }]
        }
    }
];
