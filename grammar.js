/**
 * @file Satz grammar for tree-sitter
 * @author Thomas Jirsch
 * @license MIT
 *
 * Mirrors the hand-written lexer and parser in satz (crates/satz-core/src/satz.rs):
 * ten token kinds, no operators, every keyword contextual. The `hcl { … }` body is
 * raw HCL kept brace-balanced here the way satz's scan_hcl_body keeps it — strings,
 * comments and heredocs are stepped over.
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

export default grammar({
  name: "satz",

  extras: ($) => [/\s/, $.comment],

  // Every keyword is an identifier that the lexer promotes only where the
  // keyword is valid — `action { type = "Delete" }` inside a body stays a key.
  //
  // Three keywords are valid exactly where a key or a value is valid too, and the
  // parser reads them as a keyword only when the statement's shape follows:
  // `each` opens an entry — or, at the top level, interfaces — only as
  // `each LIST by FIELD {`, `private` is a
  // statement only as `private TYPE.LABEL`, `all` is an export's value only as
  // `all TYPE`. Anything else — `each { … }`, `each x { … }`, `private = true`,
  // `private { … }`, `export "a" = all` — is a key or a param named that way. So
  // `_key` and the export value take the promoted token back as an identifier,
  // and the conflicts below let both readings run until the next token decides.
  // The parser also asks that the type stand on the line of `all` and the address
  // on the line of `private`; a line break is whitespace here, so those two
  // readings are the same on either side of one.
  word: ($) => $.identifier,

  conflicts: ($) => [
    [$.each, $._key],
    [$.each_interface, $._key],
    [$.private, $._key],
    [$.all_resources, $.export],
  ],

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
        $.each_interface,
        $.suppress,
        $.private,
        $.request,
        $.hcl_block,
        $.attribute,
        $.block,
      ),

    // estate NAME | pack NAME [version "…"] | interface "NAME" — the last heads an
    // interface file satz generates for a project: the name alone on its line, then
    // `central`, `output`, `lookup` and `managed` blocks
    header: ($) =>
      choice(
        seq(
          field("kind", choice("estate", "pack")),
          field("name", $.identifier),
          optional(seq("version", field("version", $.string))),
        ),
        seq(field("kind", "interface"), field("name", $.string)),
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

    // notice PARAM { text run severity } — the command a pack asks for once it is
    // switched on; `text` and `run` are literal strings, `severity` is one of the
    // bare words error, warning, info; the estate acknowledges by binding PARAM = true
    notice: ($) => seq("notice", field("name", $.identifier), field("body", $.body)),

    // offers "presets/x.satz" { when phase block by_hand requires excludes } — one
    // entry per pack the library offers, read by `satz pack-graph`
    offers: ($) => seq("offers", field("path", $.string), field("body", $.body)),

    // export "NAME" = VALUE [attach ["TYPE", …]] [description "…"] — one value the
    // estate publishes to the projects beside it, carried by its interfaces/;
    // `attach` and `description` follow the value in either order, each once (the
    // parser refuses a repeat). `all` with no type after it is a param named `all`.
    export: ($) =>
      seq(
        "export",
        field("name", $.string),
        "=",
        field("value", choice($.all_resources, $._value, alias("all", $.reference))),
        repeat(
          choice(
            seq("attach", field("attach", $.list)),
            seq("description", field("description", $.string)),
          ),
        ),
      ),

    // all TYPE [under TYPE.LABEL] — every resource of one type, as a map keyed by label;
    // `under` keeps the ones placed under that folder or project. The dynamic
    // precedence decides `all google_folder` followed by a two-label block: the word
    // after `all` is the type, not the export's end and the block's key.
    all_resources: ($) =>
      prec.dynamic(
        1,
        seq("all", field("type", $.identifier), optional(seq("under", field("under", $.identifier)))),
      ),

    // interface "NAME" [common] { export … use interface … } — one project's exports,
    // written to interfaces/NAME/ beside the core exports; `common` puts it into the
    // library every project's folder carries; the body holds exports and `use
    // interface` lines only
    interface: ($) =>
      seq("interface", field("name", $.string), optional("common"), field("body", $.interface_body)),
    interface_body: ($) => seq("{", repeat(choice($.export, $.use_interface)), "}"),

    // each LIST by FIELD { interface "{each.FIELD}" { … } … } — at the top level of a file:
    // each interface block written once per entry of the list param, its name and export
    // values read from the entry; a resource's `each` stands inside its type map
    each_interface: ($) =>
      seq(
        "each",
        field("list", $.identifier),
        "by",
        field("key", $.identifier),
        "{",
        repeat1($.interface),
        "}",
      ),

    // use interface "NAME" [when PARAM] / use interface ["A", "B"] [when PARAM] — the
    // project's interface carries the named interfaces' exports too; a name, never a path
    use_interface: ($) =>
      seq(
        "use",
        "interface",
        field("names", choice($.string, $.list)),
        optional(seq("when", field("condition", $.identifier))),
      ),

    // private TYPE.LABEL — keeps that resource out of every export, a pack's too; the
    // estate's own file only
    private: ($) => seq("private", field("resource", $.identifier)),

    // request LIST { key = "…" fields = [ … ] description = "…" } — what a team may add to a
    // list param through a contribution, and the shape of each entry
    request: ($) => seq("request", field("param", $.identifier), field("body", $.body)),

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
    hcl_content: ($) => repeat1(choice($.hcl_body, $.hcl_string, $.hcl_heredoc, $.hcl_text)),
    hcl_string: (_) => token(seq('"', repeat(choice(/[^"\\\n]/, /\\./)), '"')),
    // <<TAG or <<-TAG, the rest of its line, then every line up to and including the
    // first that is one bare word — satz ends the heredoc at the line that is the
    // tag; a regex cannot compare the two, so a body line that is one bare word
    // ends it here. Braces inside count for nothing. A line goes on when it is
    // blank, starts with something other than a word, or holds more after its
    // first word: another character right behind it, or whitespace and then one.
    hcl_heredoc: (_) =>
      token(
        seq(
          "<<",
          optional("-"),
          /[A-Za-z0-9_]+[^\n]*\n/,
          repeat(
            seq(
              /[ \t\r]*([^A-Za-z0-9_ \t\r\n][^\n]*|[A-Za-z0-9_]+([^A-Za-z0-9_ \t\r\n]|[ \t\r]+[^ \t\r\n])[^\n]*)?/,
              "\n",
            ),
          ),
          /[ \t\r]*[A-Za-z0-9_]+[ \t\r]*\n/,
        ),
      ),
    // Any run that opens neither a brace, a string, a comment nor a heredoc; a lone
    // `/` that is not `//` or `/*`, and a lone `<` that is not `<<`, are text too.
    hcl_text: (_) =>
      token(prec(-1, choice(/[^{}"#\/\s<][^{}"#\/<]*/, /\/[^\/*{}"#<]?/, /<[^<{}"#\/]?/))),

    body: ($) => seq("{", repeat($._entry), "}"),
    _entry: ($) => choice($.attribute, $.block, $.use_statement, $.each),

    // each LIST by FIELD { … } — inside a resource type map: one labelled body per entry
    // of the list param, labelled by the entry's FIELD; `{each.x}` and `each.x` read the
    // entry's fields
    each: ($) =>
      seq("each", field("list", $.identifier), "by", field("key", $.identifier), field("body", $.body)),

    attribute: ($) => seq(field("key", $._key), "=", field("value", $._value)),
    // KEY [NAME] { … } — a resource map, a named map entry, a nested mapping;
    // the provider schema, not the syntax, decides which.
    block: ($) =>
      seq(field("key", $._key), optional(field("name", $._key)), field("body", $.body)),
    // A key is a word or a string; `each` and `private` are words too where their
    // statement's shape does not follow (see `word` above).
    _key: ($) => choice($.identifier, $.string, alias("each", $.identifier), alias("private", $.identifier)),

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

    // "…" — escapes \n \" \\ only; {{ is a literal `{` and }} a literal `}`; a lone
    // } is literal; {name} interpolates a param.
    // A content run stops at every brace, and a lone `}` is a token of its own that
    // `}}` outruns by length. A run that could continue through a `}` lets a
    // comment-shaped run (`"//x}"`, `"#}}"`) lose to the comment token once the
    // brace ends it; a run that stops at every brace never gets that far.
    _single_string: ($) =>
      seq(
        '"',
        repeat(
          choice(
            alias(token.immediate(prec(1, /[^"\\{}\n]+/)), $.string_content),
            alias(token.immediate(prec(1, "}")), $.string_content),
            $.escape_sequence,
            $.interpolation,
          ),
        ),
        token.immediate('"'),
      ),
    escape_sequence: (_) => token.immediate(prec(1, choice(/\\[n"\\]/, "{{", "}}"))),

    // """…""" — no escapes (a backslash is literal), same {{ }} and {name} rules. A
    // content run stops at every quote and every brace, for the reason the single
    // string's does. A `"` that is not part of the closing `"""` is a token of its
    // own at precedence 0, so the closing `"""` outruns it; a lone `}` is one at
    // precedence 1, which `}}` outruns by length.
    _triple_string: ($) =>
      seq(
        '"""',
        repeat(
          choice(
            alias(token.immediate(prec(1, /[^"{}]+/)), $.string_content),
            alias(token.immediate(prec(1, "}")), $.string_content),
            alias(token.immediate('"'), $.string_content),
            alias(token.immediate(prec(1, choice("{{", "}}"))), $.escape_sequence),
            $.interpolation,
          ),
        ),
        token.immediate('"""'),
      ),

    interpolation: ($) =>
      seq(
        token.immediate("{"),
        field("parameter", alias(token.immediate(/[A-Za-z0-9_.]+/), $.parameter)),
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
