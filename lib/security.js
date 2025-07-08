const path = require('path');
const fs = require('fs');

class SecurityUtils {
  /**
   * Escape HTML to prevent XSS attacks
   * @param {string} unsafe - Untrusted string
   * @returns {string} - HTML-escaped string
   */
  static escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') {
      return '';
    }
    return unsafe
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
      .replace(/\//g, '&#x2F;');
  }

  /**
   * Validate and normalize file paths to prevent traversal attacks
   * @param {string} filePath - Path to validate
   * @param {string} allowedBase - Base directory that paths must be within
   * @returns {string} - Normalized safe path
   * @throws {Error} - If path traversal is detected
   */
  static validatePath(filePath, allowedBase) {
    if (!filePath || !allowedBase) {
      throw new Error('Invalid path parameters');
    }

    // Normalize both paths
    const normalizedPath = path.resolve(filePath);
    const normalizedBase = path.resolve(allowedBase);

    // Check if the normalized path starts with the base path
    if (!normalizedPath.startsWith(normalizedBase)) {
      throw new Error('Path traversal attempt detected');
    }

    // Additional checks for suspicious patterns
    const suspicious = ['../', '..\\', '%2e%2e', '%252e%252e'];
    const lowerPath = filePath.toLowerCase();
    for (const pattern of suspicious) {
      if (lowerPath.includes(pattern)) {
        throw new Error('Suspicious path pattern detected');
      }
    }

    return normalizedPath;
  }

  /**
   * Validate numeric input
   * @param {any} value - Value to validate
   * @param {number} min - Minimum allowed value
   * @param {number} max - Maximum allowed value
   * @returns {number} - Validated number
   * @throws {Error} - If validation fails
   */
  static validateNumber(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
    const num = Number(value);
    
    if (isNaN(num)) {
      throw new Error('Invalid number');
    }
    
    if (num < min || num > max) {
      throw new Error(`Number must be between ${min} and ${max}`);
    }
    
    return num;
  }

  /**
   * Sanitize filename for safe display
   * @param {string} filename - Filename to sanitize
   * @returns {string} - Sanitized filename
   */
  static sanitizeFilename(filename) {
    if (!filename || typeof filename !== 'string') {
      return 'unknown';
    }
    
    // Remove path components, keep only basename
    const base = path.basename(filename);
    
    // Remove potentially dangerous characters
    return base.replace(/[^a-zA-Z0-9._-]/g, '_');
  }

  /**
   * Safe deep merge that prevents prototype pollution
   * @param {object} target - Target object
   * @param {object} source - Source object
   * @returns {object} - Merged object
   */
  static safeMerge(target, source) {
    const output = { ...target };
    
    if (!source || typeof source !== 'object' || Array.isArray(source)) {
      return output;
    }

    const forbidden = ['__proto__', 'constructor', 'prototype'];
    
    for (const key in source) {
      if (forbidden.includes(key)) {
        continue; // Skip dangerous keys
      }
      
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
          if (!(key in target) || !target[key] || typeof target[key] !== 'object') {
            output[key] = source[key];
          } else {
            output[key] = this.safeMerge(target[key], source[key]);
          }
        } else {
          output[key] = source[key];
        }
      }
    }
    
    return output;
  }

  /**
   * Validate file size to prevent DoS
   * @param {string} filePath - Path to file
   * @param {number} maxSizeBytes - Maximum allowed size in bytes
   * @returns {boolean} - True if file size is acceptable
   */
  static async validateFileSize(filePath, maxSizeBytes = 100 * 1024 * 1024) { // 100MB default
    try {
      const stats = await fs.promises.stat(filePath);
      return stats.size <= maxSizeBytes;
    } catch (error) {
      throw new Error(`Cannot validate file size: ${error.message}`);
    }
  }

  /**
   * Rate limiter for preventing abuse
   */
  static createRateLimiter(maxRequests = 100, windowMs = 60000) {
    const requests = new Map();
    
    return function rateLimiter(key) {
      const now = Date.now();
      const userRequests = requests.get(key) || [];
      
      // Remove old requests outside the window
      const validRequests = userRequests.filter(time => now - time < windowMs);
      
      if (validRequests.length >= maxRequests) {
        return false; // Rate limit exceeded
      }
      
      validRequests.push(now);
      requests.set(key, validRequests);
      
      // Cleanup old entries periodically
      if (requests.size > 1000) {
        for (const [k, v] of requests.entries()) {
          if (v.every(time => now - time >= windowMs)) {
            requests.delete(k);
          }
        }
      }
      
      return true; // Request allowed
    };
  }

  /**
   * Sanitize shell arguments (for spawn, not exec)
   * @param {string} arg - Argument to sanitize
   * @returns {string} - Sanitized argument
   */
  static sanitizeShellArg(arg) {
    if (!arg || typeof arg !== 'string') {
      return '';
    }
    
    // Remove shell metacharacters
    return arg.replace(/[;&|`$<>\\]/g, '');
  }
}

module.exports = SecurityUtils;