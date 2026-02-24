export interface LanguageConfig {
    name: string,

    // Suffix of file after dot used to detect that this config should be used.
    extension: string,

    // Command to compile source to executable.
    // Use $src in place of source and $out in place of resulting executable.
    // Example: "g++ $src -o $out".
    compileCommand: string,

    // Command to run compiled program (or to run program from source for interpreted languages).
    // Use $src in place of source and $out in place of resulting executable.
    // Example: "python3 $src".
    runCommand: string,
}
