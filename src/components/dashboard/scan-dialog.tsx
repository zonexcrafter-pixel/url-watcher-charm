import { useEffect, useRef, useState } from "react";
import { Globe, Loader2, ScanSearch } from "lucide-react";
import { toast } from "sonner";
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

const DOMAIN_RE =
  /^(?!-)(?:[a-zA-Z0-9-]{1,63}\.)+[a-zA-Z]{2,63}(?::\d{1,5})?(?:\/\S*)?$/;

const SCAN_STEPS = [
  "Resolving DNS…",
  "Crawling pages…",
  "Checking internal links…",
  "Checking external links…",
  "Analyzing status codes…",
  "Generating report…",
];

interface ScanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScanStarted: (domain: string) => void;
}

export function ScanDialog({ open, onOpenChange, onScanStarted }: ScanDialogProps) {
  const [domain, setDomain] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stepIndex, setStepIndex] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  function reset() {
    setDomain("");
    setError(null);
    setScanning(false);
    setProgress(0);
    setStepIndex(0);
    if (timerRef.current) clearInterval(timerRef.current);
  }

  function normalize(value: string) {
    return value
      .trim()
      .replace(/^https?:\/\//i, "")
      .replace(/\/+$/, "");
  }

  function validate(value: string): string | null {
    if (!value) return "Please enter a domain to scan.";
    if (/\s/.test(value)) return "Domain must not contain spaces.";
    if (!DOMAIN_RE.test(value)) return "Enter a valid domain, e.g. example.com.";
    return null;
  }

  function startScan() {
    const cleaned = normalize(domain);
    const err = validate(cleaned);
    setError(err);
    if (err) return;

    setDomain(cleaned);
    setScanning(true);
    setProgress(0);
    setStepIndex(0);

    const totalTicks = SCAN_STEPS.length * 10;
    let tick = 0;
    timerRef.current = setInterval(() => {
      tick += 1;
      const pct = Math.min(100, Math.round((tick / totalTicks) * 100));
      setProgress(pct);
      setStepIndex(Math.min(SCAN_STEPS.length - 1, Math.floor(tick / 10)));
      if (tick >= totalTicks) {
        if (timerRef.current) clearInterval(timerRef.current);
        toast.success(`Scan complete for ${cleaned}`, {
          description: "23 pages crawled, 2 broken links detected.",
        });
        onScanStarted(cleaned);
        onOpenChange(false);
        reset();
      }
    }, 140);
  }

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
            Enter a domain and we'll crawl its pages to find broken links.
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
                if (e.key === "Enter" && !scanning) startScan();
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
          <Button onClick={startScan} disabled={scanning}>
            {scanning ? "Scanning…" : "Start scan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
