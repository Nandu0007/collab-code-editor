import { EditorState } from "@codemirror/state";
// This file will initialize CodeMirror in place of the current #editor div
// and provide a simple API for integration with the rest of the app.
import { EditorView, basicSetup } from "codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { java } from "@codemirror/lang-java";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";

export default class CodeMirrorEditor {
    constructor() {
        this.languageModes = {
            javascript: javascript(),
            python: python(),
            java: java(),
            html: html(),
            css: css()
        };
        this.currentLanguage = "javascript";
        this.view = null;
    }

    setEditorEnabled(enabled) {
        if (!this.view) return;
        const editable = EditorView.editable.of(enabled);
        this.view.dispatch({
            effects: EditorView.reconfigure.of([
                basicSetup,
                this.languageModes[this.currentLanguage],
                editable
            ])
        });
    }

    init() {
        const parent = document.getElementById("editor");
        parent.innerHTML = "";
        this.view = new EditorView({
            doc: '',
            extensions: [
                basicSetup,
                this.languageModes[this.currentLanguage]
            ],
            parent
        });
    }

    setLanguage(language) {
        this.currentLanguage = language;
        if (this.view) {
            this.view.dispatch({
                effects: EditorView.reconfigure.of([
                    basicSetup,
                    this.languageModes[language] || javascript()
                ])
            });
        }
    }

    getValue() {
        return this.view ? this.view.state.doc.toString() : '';
    }

    setValue(value) {
        if (this.view) {
            this.view.dispatch({
                changes: { from: 0, to: this.view.state.doc.length, insert: value }
            });
        }
    }
}
