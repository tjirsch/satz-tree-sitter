/**
 * @file Satz grammar for tree-sitter
 * @author Thomas Jirsch
 * @license MIT
 *
 * Mirrors the hand-written lexer and parser in satz (crates/satz-core/src/satz.rs):
 * ten token kinds, no operators, every keyword contextual. The `hcl { … }` body is
 * raw HCL kept brace-balanced here the way satz's scan_hcl_body keeps it — strings
 * and comments are stepped over; heredocs are not (none exist in the corpus).
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

export default grammar({
  name: "satz",

  extras: ($) => [/\s/, $.comment],

  // Every keyword is an identifier that the lexer promotes only where the
  // keyword is valid — `action { type = "Delete" }` inside a body stays a key.
  word: ($) => $.identifier,

  rules: {
    source_file: ($) => repeat($._item),

    _item: ($) =>
      choice(
        $.header,
        $.params,
        $.use_statement,
        $.claim,
        $.question,
        $.action,
        $.notice,
        $.offers,
        $.export,
        $.interface,
        $.suppress,
        $.hcl_block,
        $.attribute,
        $.block,
      ),

    // estate NAME | pack NAME [version "…"]
    header: ($) =>
      seq(
        field("kind", choice("estate", "pack")),
        field("name", $.identifier),
        optional(seq("version", field("version", $.string))),
      ),

    params: ($) => seq("params", "{", repeat($.param), "}"),
    param: ($) => seq(field("name", $.identifier), "=", field("value", $._value)),

    use_statement: ($) =>
      seq(
        "use",
        field("path", $.string),
        repeat(
          choice(
            seq("as", field("type", $.identifier)),
            seq("when", field("condition", $.identifier)),
          ),
        ),
      ),

    claim: ($) =>
      seq(
        "claim",
        field("framework", $.string),
        field("version", $.string),
        field("control", $.string),
        field("coverage", $.coverage),
        field("body", $.body),
      ),
    coverage: (_) => choice("implements", "contributes", "deviates"),

    question: ($) =>
      seq("question", optional("oneof"), field("name", $.identifier), field("body", $.body)),

    action: ($) => seq("action", field("name", $.string), field("body", $.body)),

    // notice PARAM { text run before } — what to run once the pack is switched on,
    // acknowledged when the estate binds PARAM = true
    notice: ($) => seq("notice", field("name", $.identifier), field("body", $.body)),

    // offers "presets/x.satz" { when phase block after_scaffold by_hand requires
    // excludes } — one entry per pack the library offers, read by `satz pack-graph`
    offers: ($) => seq("offers", field("path", $.string), field("body", $.body)),

    // export "NAME" = VALUE [description "…"] — one value the estate publishes to
    // the HCL beside it, emitted as an output of hcl/interface/
    export: ($) =>
      seq(
        "export",
        field("name", $.string),
        "=",
        field("value", $._value),
        optional(seq("description", field("description", $.string))),
      ),

    // interface "NAME" { export … use interface … } — one team's exports, written to
    // their own module hcl/interfaces/NAME/ beside the core exports; the body holds
    // exports and `use interface` lines only
    interface: ($) =>
      seq("interface", field("name", $.string), field("body", $.interface_body)),
    interface_body: ($) => seq("{", repeat(choice($.export, $.use_interface)), "}"),

    // use interface "NAME" [when PARAM] / use interface ["A", "B"] [when PARAM] — the
    // team's module carries the named interfaces' exports too; a name, never a path
    use_interface: ($) =>
      seq(
        "use",
        "interface",
        field("names", choice($.string, $.list)),
        optional(seq("when", field("condition", $.identifier))),
      ),

    suppress: ($) =>
      seq(
        "suppress",
        field("type", $.identifier),
        field("name", $.string),
        optional(seq("role", field("role", $.string))),
      ),

    // hcl [trust "reason"] { raw HCL, brace-balanced }
    hcl_block: ($) =>
      seq("hcl", optional(seq("trust", field("reason", $.string))), field("body", $.hcl_body)),
    // hcl_content is one node over everything between the braces, so an editor
    // can hand exactly that text to an HCL grammar.
    hcl_body: ($) => seq("{", optional($.hcl_content), "}"),
    hcl_content: ($) => repeat1(choice($.hcl_body, $.hcl_string, $.hcl_text)),
    hcl_string: (_) => token(seq('"', repeat(choice(/[^"\\\n]/, /\\./)), '"')),
    // Any run that opens neither a brace, a string nor a comment; a lone `/`
    // that is not `//` or `/*` is text too.
    hcl_text: (_) => token(prec(-1, choice(/[^{}"#\/\s][^{}"#\/]*/, /\/[^\/*{}"#]/))),

    body: ($) => seq("{", repeat($._entry), "}"),
    _entry: ($) => choice($.attribute, $.block, $.use_statement),

    attribute: ($) => seq(field("key", $._key), "=", field("value", $._value)),
    // KEY [NAME] { … } — a resource map, a named map entry, a nested mapping;
    // the provider schema, not the syntax, decides which.
    block: ($) =>
      seq(field("key", $._key), optional(field("name", $._key)), field("body", $.body)),
    _key: ($) => choice($.identifier, $.string),

    _value: ($) =>
      choice(
        $.string,
        $.number,
        $.boolean,
        alias($.identifier, $.reference),
        $.list,
        alias($.body, $.object),
      ),

    // Commas are optional between list items, as in the lexer.
    list: ($) => seq("[", repeat(seq($._value, optional(","))), "]"),

    boolean: (_) => choice("true", "false"),

    number: (_) => /-?[0-9]+(\.[0-9]+)?/,

    // The dot belongs to the identifier: `monitoring.audit_logsink` is one name.
    identifier: (_) => /[A-Za-z_][A-Za-z0-9_.]*/,

    string: ($) => choice($._single_string, $._triple_string),

    // "…" — escapes \n \" \\ only; {{ is a literal brace; a lone } is literal;
    // {name} interpolates a param.
    _single_string: ($) =>
      seq(
        '"',
        repeat(
          choice(
            alias(token.immediate(prec(1, /[^"\\{\n]+/)), $.string_content),
            $.escape_sequence,
            $.interpolation,
          ),
        ),
        token.immediate('"'),
      ),
    // `{{` is the escape for a literal brace; content stops at every `{` so
    // that a comment-shaped string (`"//…{p}"`) can never be lexed as a comment.
    escape_sequence: (_) => token.immediate(prec(1, choice(/\\[n"\\]/, "{{"))),

    // """…""" — no escapes (a backslash is literal), same {{ and {name} rules.
    _triple_string: ($) =>
      seq(
        '"""',
        repeat(
          choice(
            alias(
              token.immediate(prec(1, /([^"{]|"[^"{]|""[^"{])+/)),
              $.string_content,
            ),
            alias(token.immediate(prec(1, "{{")), $.escape_sequence),
            $.interpolation,
          ),
        ),
        token.immediate('"""'),
      ),

    interpolation: ($) =>
      seq(
        token.immediate("{"),
        field("parameter", alias(token.immediate(/[A-Za-z0-9_]+/), $.parameter)),
        token.immediate("}"),
      ),

    comment: (_) =>
      token(
        choice(
          seq("//", /.*/),
          seq("#", /.*/),
          seq("/*", /[^*]*\*+([^/*][^*]*\*+)*/, "/"),
        ),
      ),
  },
});
