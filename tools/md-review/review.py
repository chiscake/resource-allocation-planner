#!/usr/bin/env python3
"""
Markdown Review Tool
Runs multiple LLM reviewers via cursor-agent CLI to review and improve Markdown documents.
"""

import argparse
import json
import logging
import os
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple


class ReviewConfig:
    """Configuration for the review process."""

    def __init__(self, config_path: Path):
        with open(config_path, encoding="utf-8") as f:
            config = json.load(f)

        self.num_reviewers: int = config.get("num_reviewers", 2)
        self.reviewer_models: List[str] = config.get(
            "reviewer_models", ["auto"] * self.num_reviewers
        )
        self.aggregator_model: str = config.get("aggregator_model", "auto")
        self.max_iterations: int = config.get("max_iterations", 1)
        self.checklist_path: str = config.get("checklist_path", "checklist.md")
        self.log_directory: str = config.get("log_directory", ".review-logs")

        # Validate
        if len(self.reviewer_models) != self.num_reviewers:
            self.reviewer_models = (
                self.reviewer_models[: self.num_reviewers]
                + ["auto"] * (self.num_reviewers - len(self.reviewer_models))
            )


class MarkdownReviewer:
    """Orchestrates the Markdown review process."""

    def __init__(self, config: ReviewConfig, tool_dir: Path):
        self.config = config
        self.tool_dir = tool_dir
        self.log_dir = self._setup_log_directory()
        self.checklist = self._load_checklist()

        # Setup logging
        logging.basicConfig(
            level=logging.INFO,
            format="%(asctime)s [%(levelname)s] %(message)s",
            handlers=[
                logging.StreamHandler(sys.stdout),
                logging.FileHandler(self.log_dir / "review.log", encoding="utf-8"),
            ],
        )
        self.logger = logging.getLogger(__name__)

    def _setup_log_directory(self) -> Path:
        """Create a timestamped log directory."""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        log_dir = self.tool_dir / self.config.log_directory / timestamp
        log_dir.mkdir(parents=True, exist_ok=True)
        return log_dir

    def _load_checklist(self) -> str:
        """Load the review checklist."""
        checklist_path = self.tool_dir / self.config.checklist_path
        if not checklist_path.exists():
            self.logger.warning(f"Checklist not found: {checklist_path}")
            return "Review the document for quality, accuracy, and best practices."

        with open(checklist_path, encoding="utf-8") as f:
            return f.read()

    def _run_cursor_agent(
        self, prompt: str, model: str, output_file: Optional[Path] = None
    ) -> Tuple[bool, Optional[Dict]]:
        """
        Run cursor-agent CLI with the given prompt.
        Returns (success, result_dict).
        """
        try:
            cmd = [
                "cursor-agent",
                "-p",
                "--model",
                model,
                "--output-format",
                "json",
                prompt,
            ]

            self.logger.info(f"Running: cursor-agent -p --model {model}")

            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                encoding="utf-8",
                timeout=300,  # 5 minute timeout
            )

            if output_file:
                with open(output_file, "w", encoding="utf-8") as f:
                    f.write(result.stdout)
                    if result.stderr:
                        f.write("\n\n=== STDERR ===\n")
                        f.write(result.stderr)

            if result.returncode != 0:
                self.logger.error(
                    f"cursor-agent failed with code {result.returncode}: {result.stderr}"
                )
                return False, None

            # Parse JSON output
            try:
                response = json.loads(result.stdout)
                return True, response
            except json.JSONDecodeError as e:
                self.logger.error(f"Failed to parse JSON output: {e}")
                return False, None

        except subprocess.TimeoutExpired:
            self.logger.error("cursor-agent timed out")
            return False, None
        except FileNotFoundError:
            self.logger.error(
                "cursor-agent not found. Please install it using: "
                "curl https://cursor.com/install -fsS | bash (Unix) or "
                "irm 'https://cursor.com/install?win32=true' | iex (Windows)"
            )
            return False, None
        except Exception as e:
            self.logger.error(f"Unexpected error running cursor-agent: {e}")
            return False, None

    def _extract_review_result(self, response: Dict) -> Optional[Dict]:
        """
        Extract the review result from cursor-agent JSON response.
        Expected format: {"approved": bool, "issues": [...]}.
        """
        # The response structure depends on output format
        # Try to find the content in various possible locations
        content = None

        if "content" in response:
            content = response["content"]
        elif "messages" in response and len(response["messages"]) > 0:
            last_msg = response["messages"][-1]
            if "content" in last_msg:
                content = last_msg["content"]

        if not content:
            return None

        # Try to parse as JSON if it's a string
        if isinstance(content, str):
            # Look for JSON in markdown code blocks
            if "```json" in content:
                start = content.find("```json") + 7
                end = content.find("```", start)
                if end > start:
                    content = content[start:end].strip()

            try:
                result = json.loads(content)
                if "approved" in result and "issues" in result:
                    return result
            except json.JSONDecodeError:
                pass

        # If it's already a dict with the right structure
        if isinstance(content, dict):
            if "approved" in content and "issues" in content:
                return content

        return None

    def _review_with_retry(
        self, reviewer_id: int, model: str, document_path: Path, iteration: int
    ) -> Tuple[int, Optional[Dict]]:
        """
        Run a single reviewer with retry on JSON parse failure.
        Returns (reviewer_id, review_result).
        """
        prompt = f"""Review the following Markdown document according to this checklist:

{self.checklist}

Document to review: {document_path.absolute()}

Please read the document and provide your review as a JSON object with this exact structure:
{{
  "approved": true or false,
  "issues": [
    "Issue 1 description",
    "Issue 2 description"
  ]
}}

Set "approved" to true only if ALL checklist items are satisfied.
List specific, actionable issues in the "issues" array.
Return ONLY the JSON object, wrapped in a ```json code block.
"""

        output_file = (
            self.log_dir / f"iteration_{iteration}_reviewer_{reviewer_id}_{model}.txt"
        )

        # First attempt
        success, response = self._run_cursor_agent(prompt, model, output_file)
        if success and response:
            result = self._extract_review_result(response)
            if result:
                return reviewer_id, result

        # Retry once on failure
        self.logger.warning(
            f"Reviewer {reviewer_id} ({model}) failed to return valid JSON, retrying..."
        )
        retry_output = self.log_dir / f"iteration_{iteration}_reviewer_{reviewer_id}_{model}_retry.txt"
        success, response = self._run_cursor_agent(prompt, model, retry_output)
        if success and response:
            result = self._extract_review_result(response)
            if result:
                return reviewer_id, result

        self.logger.error(
            f"Reviewer {reviewer_id} ({model}) failed after retry, skipping"
        )
        return reviewer_id, None

    def _run_reviewers(
        self, document_path: Path, iteration: int
    ) -> List[Optional[Dict]]:
        """Run all reviewers in parallel."""
        self.logger.info(f"Starting {self.config.num_reviewers} reviewers...")

        reviews = [None] * self.config.num_reviewers

        with ThreadPoolExecutor(max_workers=self.config.num_reviewers) as executor:
            futures = {
                executor.submit(
                    self._review_with_retry,
                    i,
                    self.config.reviewer_models[i],
                    document_path,
                    iteration,
                ): i
                for i in range(self.config.num_reviewers)
            }

            for future in as_completed(futures):
                reviewer_id, result = future.result()
                reviews[reviewer_id] = result
                if result:
                    status = "✓ APPROVED" if result["approved"] else "✗ NEEDS WORK"
                    self.logger.info(
                        f"Reviewer {reviewer_id} ({self.config.reviewer_models[reviewer_id]}): {status}"
                    )

        # Save combined results
        results_file = self.log_dir / f"iteration_{iteration}_reviews.json"
        with open(results_file, "w", encoding="utf-8") as f:
            json.dump(reviews, f, indent=2, ensure_ascii=False)

        return reviews

    def _run_aggregator(
        self, document_path: Path, reviews: List[Optional[Dict]], iteration: int
    ) -> bool:
        """Run aggregator to merge issues and edit the document."""
        # Filter out failed reviews
        valid_reviews = [r for r in reviews if r is not None]
        if not valid_reviews:
            self.logger.error("No valid reviews to aggregate")
            return False

        # Compile all issues
        all_issues = []
        for i, review in enumerate(valid_reviews):
            if review and review["issues"]:
                all_issues.append(f"\n## Reviewer {i + 1} issues:")
                all_issues.extend(f"- {issue}" for issue in review["issues"])

        if not all_issues:
            self.logger.info("No issues to address")
            return True

        issues_text = "\n".join(all_issues)

        prompt = f"""You are an expert Markdown editor. Review this document and the issues found by multiple reviewers.
Your task is to edit the document to address ALL valid issues.

Document to edit: {document_path.absolute()}

Issues from reviewers:
{issues_text}

Instructions:
1. Read the current document content
2. Merge duplicate or overlapping issues
3. Ignore contradictory feedback (use your best judgment)
4. Edit the document IN PLACE to fix all valid issues
5. Ensure the document follows Markdown best practices

Use your file editing tools to modify the document directly.
After editing, confirm what changes you made.
"""

        output_file = self.log_dir / f"iteration_{iteration}_aggregator.txt"
        self.logger.info(
            f"Running aggregator ({self.config.aggregator_model}) to apply fixes..."
        )

        success, response = self._run_cursor_agent(
            prompt, self.config.aggregator_model, output_file
        )

        if not success:
            self.logger.error("Aggregator failed")
            return False

        self.logger.info("Aggregator completed")
        return True

    def review_document(self, document_path: Path) -> bool:
        """Main review loop."""
        if not document_path.exists():
            self.logger.error(f"Document not found: {document_path}")
            return False

        self.logger.info(f"Starting review of: {document_path}")
        self.logger.info(f"Max iterations: {self.config.max_iterations}")
        self.logger.info(f"Logs will be saved to: {self.log_dir}")

        for iteration in range(1, self.config.max_iterations + 1):
            self.logger.info(f"\n{'='*60}")
            self.logger.info(f"ITERATION {iteration}/{self.config.max_iterations}")
            self.logger.info(f"{'='*60}\n")

            # Run reviewers
            reviews = self._run_reviewers(document_path, iteration)

            # Check if all approved
            valid_reviews = [r for r in reviews if r is not None]
            if not valid_reviews:
                self.logger.error("All reviewers failed")
                return False

            approved_count = sum(1 for r in valid_reviews if r["approved"])
            total_count = len(valid_reviews)

            self.logger.info(
                f"\nReview status: {approved_count}/{total_count} approved"
            )

            if approved_count == total_count:
                self.logger.info("\n✓ All reviewers approved! Review complete.")
                return True

            # Run aggregator to fix issues
            if not self._run_aggregator(document_path, reviews, iteration):
                self.logger.error("Aggregator failed, stopping review")
                return False

            if iteration == self.config.max_iterations:
                self.logger.warning(
                    "\n⚠ Maximum iterations reached. Some issues may remain."
                )
                self.logger.info(
                    f"Final status: {approved_count}/{total_count} reviewers approved"
                )
                return False

        return False


def main():
    parser = argparse.ArgumentParser(
        description="Review and improve Markdown documents using multiple LLMs via cursor-agent CLI"
    )
    parser.add_argument("document", type=Path, help="Path to the Markdown file to review")
    parser.add_argument(
        "--config",
        type=Path,
        default=None,
        help="Path to config file (default: config.json in tool directory)",
    )

    args = parser.parse_args()

    # Determine tool directory
    tool_dir = Path(__file__).parent.absolute()

    # Load config
    config_path = args.config or (tool_dir / "config.json")
    if not config_path.exists():
        print(f"Error: Config file not found: {config_path}", file=sys.stderr)
        return 1

    try:
        config = ReviewConfig(config_path)
        reviewer = MarkdownReviewer(config, tool_dir)
        success = reviewer.review_document(args.document.absolute())
        return 0 if success else 1
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        import traceback

        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
