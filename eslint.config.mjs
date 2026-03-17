export default [
	{
		languageOptions: {
			ecmaVersion: 2021,
			globals: {
				// Browser globals
				window: "readonly",
				document: "readonly",
				localStorage: "readonly",
				console: "readonly",
				fetch: "readonly",
				URL: "readonly",
				Blob: "readonly",
				setTimeout: "readonly",
				setInterval: "readonly",
				clearInterval: "readonly",
				alert: "readonly",
				confirm: "readonly",
				prompt: "readonly",
				atob: "readonly",
				btoa: "readonly",
				FileReader: "readonly",
				URLSearchParams: "readonly",
				HTMLElement: "readonly",
				// Node globals
				require: "readonly",
				module: "readonly",
				exports: "readonly",
				process: "readonly",
				__dirname: "readonly",
				__filename: "readonly",
			},
		},
		rules: {
			"no-unused-vars": "warn",
			"no-undef": "off",
		},
	},
];
