// Patterns to filter out noisy terminal output
const PROGRESS_PATTERNS = [
    // Generic progress indicators
    /^[\s\t]*[▏▎▍▌▋▊▉█░⣾⣽⣻⢿⡿⣟⣯⣷┃|-]*\s*\d+%.*$/,  // Generic progress bars
    /^[\s\t]*[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏⠴].*$/,  // Spinners
    /^[\s\t]*[><=]*\s*\d+\/\d+\s*[><=]*.*$/,  // Download counters
    
    // pip-specific patterns
    /^[\s\t]*Collecting\s+.*$/,  // Package collection messages
    /^[\s\t]*Downloading\s+.*$/,  // All download messages
    /^[\s\t]*Installing\s+collected\s+packages.*$/,  // Installation start messages
    /^[\s\t]*Successfully\s+installed.*$/,  // Installation completion messages
    /^[\s\t]*Building\s+wheels.*$/,  // Wheel building messages
    /^[\s\t]*Found existing installation.*$/,  // Installation status messages
    /^[\s\t]*Uninstalling.*$/,  // Uninstallation messages
    /^[\s\t]*Attempting uninstall.*$/,  // Uninstall attempts
    /^[\s\t]*Requirement already satisfied.*$/,  // Already satisfied messages
    /^[\s\t]*Processing\s+.*$/,  // Processing messages
    /^[\s\t]*Preparing\s+.*$/,  // Preparation messages
    /^[\s\t]*Running\s+setup\.py.*$/,  // Setup execution messages
    /^[\s\t]*━+.*$/,  // Any line containing progress bar characters
    
    // npm-specific patterns
    /^[\s\t]*added \d+ packages?.*(removed|in).*$/i,  // Package addition summaries
    /^[\s\t]*removed \d+ packages?.*$/i,  // Package removal messages
    /^[\s\t]*up to date.*$/i,  // Up-to-date messages
    /^[\s\t]*\[notice\].*$/i,  // npm notices
    /^[\s\t]*npm WARN.*$/i,  // npm warnings
    /^[\s\t]*\[=*\s*\]\s*\d+%.*$/,  // npm style progress
    /^[\s\t]*\d+ packages? are looking for funding.*$/i,  // Funding messages
    /^[\s\t]*run `npm fund`.*$/i,  // Fund command suggestions
    /^[\s\t]*found \d+ vulnerabilit.*$/i,  // Vulnerability reports
    
    // Build tool patterns
    /^[\s\t]*\[\d+\/\d+\].*$/,  // Build progress counters
    /^[\s\t]*CREATE.*$/,  // File creation messages
    /^[\s\t]*UPDATE.*$/,  // Update messages
    
    // curl-style progress
    /^[\s\t]*\d+%\|[█▉▊▋▌▍▎▏\s]*\|.*$/,  // curl progress bars
    
    // VSCode terminal artifacts
    /^[\s\t]*[%$#>]\s*$/,  // Terminal prompt characters
    /^\s*$/,  // Empty lines
    /^[\s\t]*\x1b\[.*$/  // ANSI escape sequences
]

/**
 * Determines whether a line of terminal output should be filtered out
 * @param line The line to check
 * @returns true if the line should be filtered out, false otherwise
 */
export function shouldFilterLine(line: string): boolean {
    // Skip empty or whitespace-only lines
    if (!line || !line.trim()) return true
    
    // Normalize the line by trimming and converting multiple spaces to single space
    const normalizedLine = line.trim().replace(/\s+/g, ' ')
    
    // Check against progress patterns
    return PROGRESS_PATTERNS.some(pattern => pattern.test(normalizedLine))
}
