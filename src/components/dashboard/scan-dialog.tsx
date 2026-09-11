import { useEffect, useRef, useState } from "react";
import { Globe, Loader2, ScanSearch } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";

const DOMAIN_RE = /^(?!-)(?:[a-zA-Z0-9-]{1,63}\.)+[a-zA-Z]{2,63}(?::\d{1,5})?$/;

const SCAN_STEPS = [
  "Scanning target site…",
  "Discovering internal links…",
  "Testing every link…",
  "Analyzing status codes…",
  "Saving results…",
];

interface ScanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScan: (domain: string) => Promise<void>;
}

export function ScanDialog({ open, onOpenChange, onScan }: ScanDialogProps) {
  const [domain, setDomain] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  function stopTimer() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }

  function reset() {
    setDomain("");
    setError(null);
    setScanning(false);
    setStepIndex(0);
    stopTimer();
  }

  function normalize(value: string) {
    return value
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//i, "")
      .replace(/\/.*$/, "");
  }

  function validate(value: string): string | null {
    if (!value) return "Please enter a domain to scan.";
    if (/\s/.test(value)) return "Domain must not contain spaces.";
    if (!DOMAIN_RE.test(value)) return "Enter a valid domain, e.g. example.com.";
    return null;
  }

  async function startScan() {
    const cleaned = normalize(domain);
    const err = validate(cleaned);
    setError(err);
    if (err) return;

    setDomain(cleaned);
    setScanning(true);
    setStepIndex(0);
    timerRef.current = setInterval(() => {
      setStepIndex((i) => Math.min(SCAN_STEPS.length - 1, i + 1));
    }, 2500);

    try {
      await onScan(cleaned);
      stopTimer();
      onOpenChange(false);
      reset();
    } catch (e) {
      stopTimer();
      setScanning(false);
      setStepIndex(0);
      setError(e instanceof Error ? e.message : "Scan failed. Please try again.");
    }
  }

  const progress = Math.round(((stepIndex + 1) / (SCAN_STEPS.length + 1)) * 100);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!scanning) {
          if (!next) reset();
          onOpenChange(next);
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanSearch className="h-5 w-5 text-primary" />
            Scan a new site
          </DialogTitle>
          <DialogDescription>
            Enter a domain and we'll crawl its pages live to find broken links.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="scan-domain">Domain</Label>
          <div className="relative">
            <Globe className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="scan-domain"
              placeholder="example.com"
              value={domain}
              disabled={scanning}
              onChange={(e) => {
                setDomain(e.target.value);
                if (error) setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !scanning) void startScan();
              }}
              className="pl-9"
              aria-invalid={!!error}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        {scanning && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {SCAN_STEPS[stepIndex]}
              </span>
              <span className="font-medium tabular-nums">{progress}%</span>
            </div>
            <Progress value={progress} />
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
              reset();
            }}
            disabled={scanning}
          >
            Cancel
          </Button>
          <Button onClick={() => void startScan()} disabled={scanning}>
            {scanning ? "Scanning…" : "Start scan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
