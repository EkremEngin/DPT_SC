#!/bin/bash
###############################################################################
# P5.3 Security: OWASP ZAP DAST Scan Script
#
# This script runs a baseline DAST scan using OWASP ZAP
# to identify common security vulnerabilities in the running application.
#
# Usage:
#   ./dast-scan.sh [TARGET_URL] [OUTPUT_DIR]
#
# Environment Variables:
#   TARGET_URL  - URL to scan (default: http://localhost:3001)
#   OUTPUT_DIR  - Directory for reports (default: ./security-reports)
###############################################################################

set -e

# Configuration
TARGET_URL="${1:-${TARGET_URL:-http://localhost:3001}}"
OUTPUT_DIR="${2:-${OUTPUT_DIR:-./security-reports}}"
ZAP_VERSION="2.14.0"
ZAP_IMAGE="owasp/zap2docker-stable"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Create output directory
mkdir -p "$OUTPUT_DIR"

echo "=========================================="
echo "OWASP ZAP DAST Scan"
echo "=========================================="
echo "Target: $TARGET_URL"
echo "Output: $OUTPUT_DIR"
echo "=========================================="

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo -e "${RED}[ERROR]${NC} Docker is not installed. Please install Docker to run OWASP ZAP."
    echo "Visit: https://www.docker.com/get-started"
    exit 1
fi

# Check if the target is accessible
echo -e "${YELLOW}[INFO]${NC} Checking if target URL is accessible..."
if ! curl -s --head "$TARGET_URL" | head -n 1 | grep -q "HTTP"; then
    echo -e "${YELLOW}[WARN]${NC} Target URL may not be accessible. Continuing anyway..."
fi

# Pull the latest ZAP image
echo -e "${YELLOW}[INFO]${NC} Pulling OWASP ZAP Docker image..."
docker pull "$ZAP_IMAGE" || {
    echo -e "${RED}[ERROR]${NC} Failed to pull ZAP image. Check your internet connection."
    exit 1
}

# ZAP configuration file
cat > /tmp/zap.conf << EOF
# ZAP Configuration
# Disable automated attack (spider + active scan only)
zap.spider.duration=5
zap.spider.depth=5

# Alert thresholds
zap.alertthreshold.high=HIGH
zap.alertthreshold.medium=HIGH
zap.alertthreshold.low=MEDIUM

# Exclude common false positives
zap.excludepattern.1=.*\\.js$
zap.excludepattern.2=.*\\.css$
zap.excludepattern.3=.*\\.png$
zap.excludepattern.4=.*\\.jpg$
zap.excludepattern.5=.*\\.svg$
zap.excludepattern.6=.*\\.ico$

# AJAX spider
zap.ajax spider.enabled=true
zap.ajax spider.duration=60
EOF

# Run ZAP baseline scan
echo -e "${YELLOW}[INFO]${NC} Starting ZAP baseline scan..."
echo -e "${YELLOW}[INFO]${NC} This may take 2-5 minutes..."

docker run --rm \
    -v "$(pwd)/$OUTPUT_DIR:/zap/wrk" \
    -v "/tmp/zap.conf:/zap/zap.conf" \
    -t \
    "$ZAP_IMAGE" \
    zap-baseline.py \
    -t "$TARGET_URL" \
    -r "/zap/wrk/zap-report.html" \
    -x "/zap/wrk/zap-report.xml" \
    -w "/zap/wrk/zap-report.md" \
    -c "/zap/zap.conf" \
    --hook=/zap/hooks/ \
    -a || {

    echo -e "${YELLOW}[WARN]${NC} ZAP scan completed with warnings. Check the report for details."
}

# Generate summary
echo ""
echo "=========================================="
echo "Scan Complete!"
echo "=========================================="
echo "Reports generated in: $OUTPUT_DIR"
echo ""
echo "  - zap-report.html  (Interactive HTML report)"
echo "  - zap-report.xml   (Machine-readable XML)"
echo "  - zap-report.md    (Markdown summary)"
echo ""

# Count alerts if report exists
if [ -f "$OUTPUT_DIR/zap-report.xml" ]; then
    HIGH_COUNT=$(grep -o 'riskcode="3"' "$OUTPUT_DIR/zap-report.xml" | wc -l || echo "0")
    MEDIUM_COUNT=$(grep -o 'riskcode="2"' "$OUTPUT_DIR/zap-report.xml" | wc -l || echo "0")
    LOW_COUNT=$(grep -o 'riskcode="1"' "$OUTPUT_DIR/zap-report.xml" | wc -l || echo "0")
    INFO_COUNT=$(grep -o 'riskcode="0"' "$OUTPUT_DIR/zap-report.xml" | wc -l || echo "0")

    echo "Alert Summary:"
    echo "  - High:   $HIGH_COUNT"
    echo "  - Medium: $MEDIUM_COUNT"
    echo "  - Low:    $LOW_COUNT"
    echo "  - Info:   $INFO_COUNT"
    echo ""

    if [ "$HIGH_COUNT" -gt 0 ]; then
        echo -e "${RED}[ALERT]${NC} High severity vulnerabilities found! Review the report immediately."
    elif [ "$MEDIUM_COUNT" -gt 0 ]; then
        echo -e "${YELLOW}[WARN]${NC} Medium severity issues found. Review and address."
    else
        echo -e "${GREEN}[OK]${NC} No critical vulnerabilities detected."
    fi
fi

echo ""
echo "Open the HTML report:"
echo "  file://$(pwd)/$OUTPUT_DIR/zap-report.html"
echo ""
echo "=========================================="

# Exit with appropriate code
if [ "$HIGH_COUNT" -gt 0 ]; then
    exit 1
else
    exit 0
fi
