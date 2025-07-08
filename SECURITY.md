# Security Policy

## Security Measures

This tool implements several security measures to protect against common vulnerabilities:

### 1. Command Injection Prevention
- Uses `child_process.spawn()` instead of `exec()` for opening browsers
- Properly separates command and arguments to prevent shell injection

### 2. XSS (Cross-Site Scripting) Prevention
- All user-generated content is HTML-escaped before rendering
- Implements Content Security Policy (CSP) headers in generated reports
- Dynamic content generation uses safe escaping functions

### 3. Path Traversal Protection
- Validates all file paths to ensure they stay within expected directories
- Normalizes paths and checks against base directories
- Rejects paths containing suspicious patterns

### 4. Prototype Pollution Prevention
- Safe deep merge implementation that blocks dangerous keys
- Prevents modification of `__proto__`, `constructor`, and `prototype`

### 5. DoS (Denial of Service) Protection
- File size validation (100MB limit by default)
- Memory usage limits for session data
- Rate limiting capabilities for monitoring

### 6. Input Validation
- CLI arguments are validated and sanitized
- Numeric inputs are range-checked
- Export formats are whitelisted

### 7. Error Handling
- Sensitive information (full paths) is not exposed in error messages
- Proper resource cleanup in error scenarios
- Graceful error handling that doesn't crash the application

## Reporting Security Vulnerabilities

If you discover a security vulnerability, please:

1. **DO NOT** create a public GitHub issue
2. Email the maintainers with details of the vulnerability
3. Allow reasonable time for a fix before public disclosure

## Security Best Practices for Users

1. Keep the tool updated to the latest version
2. Review configuration files before importing
3. Be cautious with exported data containing sensitive information
4. Use the tool only on trusted Claude Code conversation data
5. Set appropriate alert thresholds for your use case

## Dependencies

This tool uses only Node.js built-in modules and trusted CDN resources for the web interface:
- Chart.js (for visualizations)
- Font Awesome (for icons)

No data is sent to external servers - all analysis is performed locally.