/**
 * Clipboard monitor script with Windows tray icon.
 * This script monitors the clipboard for fixable URLs and replaces them with the correct URL.
 * Includes a system tray icon for easy enabling/disabling.
 * 
 * @author Gio Pavanelli (https://github.com/giofolf)
 * @license MIT
 * @version 1.1.0
 */

import { readFileSync } from "fs";
import { join } from "path";
import Tray from "trayicon";

/**
 * Class representing a URL replacer
 */
class UrlReplacer {
    constructor(public pattern: RegExp, public replacement: string) {}

    apply(text: string): string {
        let match;
        let result = text;
        
        // Replace all matches
        while ((match = result.match(this.pattern))) {
            console.info("Found match %s, replacing with %s", match[0], this.replacement);
            result = result.replace(match[0], this.replacement);
        }
        
        return result;
    }
}

/**
 * Class for clipboard monitoring and fixing links
 */
class ClipboardMonitor {
    /**
     * A list of URL replacers.
     */
    private replacers: UrlReplacer[];

    /**
     * The last clipboard content.
     */
    private lastClipboardContent: string = "";

    /**
     * Flag to indicate if monitoring is enabled.
     */
    private isMonitoringEnabled: boolean = true;

    /**
     * The Windows system tray icon.
     */
    private tray = null;

    /**
     * The polling interval in milliseconds.
     */
    private pollingInterval: number = 500;

    /**
     * The interval ID for the clipboard monitoring.
     */
    private intervalId: NodeJS.Timeout | null = null;

    constructor() {     
        // Initialize replacers
        this.replacers = [
            new UrlReplacer(/https?:\/\/(?<!fixup)(twitter|x)\.com/g, "https://fixupx.com"),
            new UrlReplacer(/https?:\/\/(?<!dd)instagram\.com/g, "https://ddinstagram.com"),
            new UrlReplacer(/https?:\/\/(?<!fixup)tiktok\.com/g, "https://fixuptiktok.com"),
        ];

        // Set process title
        process.title = "Fix embeddedable links";
    }

    /**
     * Initialize the application.
     */
    async init() {
        console.log("Starting clipboard monitor with tray icon...");

        // Initialize tray if on Windows
        if (process.platform === "win32") {
            console.info("Initializing tray icon...");
            await this.initTray();
        } else {
            console.info("Tray icon is only supported on Windows");
            console.log("Tray icon is only supported on Windows");
        }

        // Start monitoring
        this.startMonitoring();

        console.log("Press Ctrl+C to exit or use the tray icon");
    }

    /**
     * Initialize the system tray icon.
     */
    private async initTray() {
        try {
            // Create tray icon
            this.tray = await new Promise((resolve, reject) => {
                Tray.create({
                    title: "Link Fixer"
                }, resolve)
                .catch(reject);
            });

            this.tray.item("Enable Monitoring", () => this.toggleMonitoring());
            this.tray.item("Exit", () => this.exit());

            // Update tray icon
            this.updateTray();

            console.log("Tray icon initialized");
        } catch (error) {
            console.error("Failed to initialize tray:", error);
        }
    }

    /**
     * Update the tray icon and menu.
     */
    private updateTray() {
        // Ignore if tray is not initialized
        if (!this.tray) {
            return;
        }
        
        try {
            // Get icon path
            const iconPathName = join(__dirname, "assets", this.isMonitoringEnabled ? "icon-enabled.ico" : "icon-disabled.ico");

            // Read icon data
            const iconBuff = readFileSync(iconPathName);
            
            // Update icon
            this.tray.setIcon(iconBuff);
        } catch (error) {
            console.error("Error updating tray:", error);
        }
    }

    /**
     * Toggle monitoring state.
     */
    toggleMonitoring() {
        this.isMonitoringEnabled = !this.isMonitoringEnabled;
        console.log(`Clipboard monitoring ${this.isMonitoringEnabled ? "enabled" : "disabled"}`);
        
        // Update tray
        this.updateTray();
    }

    /**
     * Start the clipboard monitoring process.
     */
    startMonitoring() {
        // Start polling
        this.intervalId = setInterval(() => this.checkClipboard(), this.pollingInterval);
        console.log("Clipboard monitoring started");
    }

    /**
     * Stop the clipboard monitoring process.
     */
    stopMonitoring() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            console.log("Clipboard monitoring stopped");
        }
    }

    /**
     * Exit the application
     */
    exit() {
        console.log("Exiting application");
        this.stopMonitoring();
        
        if (this.tray) {
            this.tray.destroy();
        }
        
        process.exit(0);
    }

    /**
     * Detect and fix links in a string.
     * @param text The string to detect and fix links in.
     * @returns The fixed string or null if no links were found.
     */
    detectAndFixLinks(text: string) {
        if (!text) {
            return text;
        }

        // Apply all replacers to the text
        return this.replacers.reduce((currentText, replacer) => {
            return replacer.apply(currentText);
        }, text);
    }

    /**
     * Read clipboard content.
     * @returns The clipboard content or an empty string if reading fails.
     * @throws Error if reading fails.
     */
    async readClipboard(): Promise<string> {
        try {
            // On Windows, use PowerShell to read the clipboard
            if (process.platform === "win32") {
                const proc = Bun.spawn(["powershell.exe", "-command", "Get-Clipboard"], {
                    stdout: "pipe",
                });
                
                const output = await new Response(proc.stdout).text();
                return output.trim();
            } else
            // On macOS
            if (process.platform === "darwin") {
                const proc = Bun.spawn(["pbpaste"], {
                    stdout: "pipe",
                });
                
                const output = await new Response(proc.stdout).text();
                return output.trim();
            } else
            // On Linux, try xclip
            if (process.platform === "linux") {
                const proc = Bun.spawn(["xclip", "-selection", "clipboard", "-o"], {
                    stdout: "pipe",
                });
                
                const output = await new Response(proc.stdout).text();
                return output.trim();
            }
            
            return "";
        } catch (e) {
            console.error("Error reading clipboard:", e);
            return "";
        }
    }

    /**
     * Write content to clipboard.
     * @param text The text to write to the clipboard.
     * @returns True if writing was successful, false otherwise.
     */
    async writeClipboard(text: string) {
        try {
            // On Windows, use PowerShell to write to the clipboard
            if (process.platform === "win32") {
                const proc = Bun.spawn(["powershell.exe", "-command", `Set-Clipboard -Value '${text.replace(/'/g, "''")}'`]);
                await proc.exited;
                return true;
            } else
            // On macOS
            if (process.platform === "darwin") { 
                const proc = Bun.spawn(["pbcopy"], {
                    stdin: "pipe",
                });
                
                proc.stdin.write(text);
                proc.stdin.end();
                
                await proc.exited;
                return true;
            } else
            // On Linux, try xclip
            if (process.platform === "linux") {
                const proc = Bun.spawn(["xclip", "-selection", "clipboard"], {
                    stdin: "pipe",
                });
                
                proc.stdin.write(text);
                proc.stdin.end();
                
                await proc.exited;
                return true;
            }
            
            return false;
        } catch (e) {
            console.error("Error writing to clipboard:", e);
            return false;
        }
    }

    /**
     * Check clipboard for content and process it.
     * @throws Error if an error occurs.
     */
    async checkClipboard() {
        try {
            // Skip if monitoring is disabled
            if (!this.isMonitoringEnabled) {
                return;
            }
            
            // Read the current clipboard content
            const clipboardContent = await this.readClipboard();
            
            // If has no length, skip
            if (!clipboardContent?.length) {
                return;
            }
            
            // Check if the content has changed
            if (clipboardContent !== this.lastClipboardContent) {
                this.lastClipboardContent = clipboardContent;
                
                // Process the content
                const fixedContent = this.detectAndFixLinks(clipboardContent);
                
                // Ignore if `fixedContent` is null
                if (!fixedContent) {
                    return;
                }
                
                // Only update if the content has changed
                if (fixedContent !== clipboardContent) {
                    console.log(`Detected link! Replacing...`);
                    console.log(`Original: ${clipboardContent}`);
                    console.log(`Fixed: ${fixedContent}`);
                    
                    // Update the clipboard
                    if (!await this.writeClipboard(fixedContent)) {
                        console.error("Failed to update clipboard");
                    }
                    
                    // Update our stored content to prevent loop
                    this.lastClipboardContent = fixedContent;
                }
            }
        } catch (error) {
            console.error("Error in clipboard monitoring:", error);
        }
    }
}

/**
 * Entry point for the application
 */
async function main() {
    const monitor = new ClipboardMonitor();
    
    // Handle process termination
    process.on("SIGINT", () => {
        console.log("Received SIGINT signal");
        monitor.exit();
    });
    
    process.on("SIGTERM", () => {
        console.log("Received SIGTERM signal");
        monitor.exit();
    });
    
    // Initialize and start monitoring
    await monitor.init();
}

// Run the application
main().catch(console.error);