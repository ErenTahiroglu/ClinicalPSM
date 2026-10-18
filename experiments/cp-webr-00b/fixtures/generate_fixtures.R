# Deterministic synthetic fixture generator for CP-WEBR-00B
# Output: JSON files for each fixture containing metadata, data frame, and call arguments

suppressPackageStartupMessages({
  library(stats)
  library(utils)
})

base_dir <- "experiments/cp-webr-00b/fixtures"
dir.create(base_dir, showWarnings = FALSE, recursive = TRUE)

fixtures <- list()

# Helper to write fixture
save_fixture <- function(id, name, desc, data, formula_str, distance, link, caliper, std_caliper, discard, ratio, replace, m_order, expected_status) {
  fix <- list(
    id = id,
    name = name,
    description = desc,
    formula = formula_str,
    method = "nearest",
    distance = distance,
    link = link,
    caliper = caliper,
    std_caliper = std_caliper,
    discard = discard,
    ratio = ratio,
    replace = replace,
    m_order = m_order,
    expected_status = expected_status,
    n_total = nrow(data),
    n_treated = sum(data$treat == 1, na.rm = TRUE),
    n_control = sum(data$treat == 0, na.rm = TRUE),
    data = as.data.frame(data)
  )

  # Write CSV for transparent inspection
  csv_file <- file.path(base_dir, paste0(id, ".csv"))
  write.csv(data, csv_file, row.names = FALSE, na = "NA")

  # Save JSON spec
  json_file <- file.path(base_dir, paste0(id, ".json"))
  # Use simple JSON serialization
  # We will serialize in R
  return(fix)
}

set.seed(20261019)

# 1. Well-conditioned logistic regression
n1 <- 300
d1 <- data.frame(
  id = paste0("sub_", sprintf("%04d", 1:n1)),
  treat = rbinom(n1, 1, 0.35),
  age = round(rnorm(n1, mean = 55, sd = 10), 1),
  bmi = round(rnorm(n1, mean = 27, sd = 4), 1),
  sbp = round(rnorm(n1, mean = 130, sd = 15), 0)
)
fixtures[[1]] <- save_fixture("fix_01_well_conditioned", "Well-conditioned logistic regression",
  "N=300, 3 continuous covariates, well-conditioned GLM",
  d1, "treat ~ age + bmi + sbp", "glm", "linear.logit", NULL, FALSE, "none", 1, FALSE, "largest", "SUCCESS")

# 2. Mixed continuous, binary and multi-level factors
n2 <- 400
d2 <- data.frame(
  id = paste0("sub_", sprintf("%04d", 1:n2)),
  treat = rbinom(n2, 1, 0.4),
  x_cont = rnorm(n2),
  x_bin = rbinom(n2, 1, 0.5),
  x_cat = factor(sample(c("low", "med", "high"), n2, replace = TRUE), levels = c("low", "med", "high"))
)
fixtures[[2]] <- save_fixture("fix_02_mixed_types", "Mixed factor types",
  "N=400 with continuous, binary, and 3-level factor",
  d2, "treat ~ x_cont + x_bin + x_cat", "glm", "linear.logit", NULL, FALSE, "none", 1, FALSE, "largest", "SUCCESS")

# 3. Explicit reference-level changes
d3 <- d2
d3$x_cat <- relevel(d3$x_cat, ref = "med")
fixtures[[3]] <- save_fixture("fix_03_ref_level_change", "Reference level change",
  "Same data as fix_02 with x_cat releveled to med",
  d3, "treat ~ x_cont + x_bin + x_cat", "glm", "linear.logit", NULL, FALSE, "none", 1, FALSE, "largest", "SUCCESS")

# 4. Input-row-order changes
d4 <- d1[rev(seq_len(nrow(d1))), ]
fixtures[[4]] <- save_fixture("fix_04_input_row_order", "Row order permutation",
  "Reverse row order of fix_01; pair assignments must match by unit ID",
  d4, "treat ~ age + bmi + sbp", "glm", "linear.logit", NULL, FALSE, "none", 1, FALSE, "largest", "SUCCESS")

# 5. Exact distance ties
n5 <- 100
d5 <- data.frame(
  id = paste0("sub_", sprintf("%04d", 1:n5)),
  treat = rep(c(1, 0), each = 50),
  x1 = rep(c(1, 2, 3, 4, 5), each = 10, times = 2),
  x2 = rep(c(0, 1), 50)
)
fixtures[[5]] <- save_fixture("fix_05_exact_distance_ties", "Exact distance ties",
  "Discrete covariates with identical propensity scores across multiple controls",
  d5, "treat ~ x1 + x2", "glm", "linear.logit", NULL, FALSE, "none", 1, FALSE, "largest", "SUCCESS")

# 6. No-caliper nearest matching
fixtures[[6]] <- save_fixture("fix_06_no_caliper_nearest", "No-caliper nearest neighbor",
  "Verify caliper=NULL behavior",
  d1, "treat ~ age + bmi + sbp", "glm", "linear.logit", NULL, FALSE, "none", 1, FALSE, "largest", "SUCCESS")

# 7. Probability-scale caliper
fixtures[[7]] <- save_fixture("fix_07_prob_scale_caliper", "Probability scale caliper",
  "distance=glm, link=logit, caliper=0.1 on raw probabilities",
  d1, "treat ~ age + bmi + sbp", "glm", "logit", 0.1, FALSE, "none", 1, FALSE, "largest", "SUCCESS")

# 8. Linear-logit caliper
fixtures[[8]] <- save_fixture("fix_08_linear_logit_caliper", "Linear-logit caliper",
  "distance=glm, link=linear.logit, caliper=0.2 unstandardized",
  d1, "treat ~ age + bmi + sbp", "glm", "linear.logit", 0.2, FALSE, "none", 1, FALSE, "largest", "SUCCESS")

# 9. Standardized caliper
fixtures[[9]] <- save_fixture("fix_09_standardized_caliper", "Standardized distance caliper",
  "MatchIt 4.8.1 process.caliper: caliper=0.2 * sd(distance[!discarded])",
  d1, "treat ~ age + bmi + sbp", "glm", "linear.logit", 0.2, TRUE, "none", 1, FALSE, "largest", "SUCCESS")

# 10. Deliberate difference between whole-sample SD and within-group pooled SD
n10_t <- 50
n10_c <- 150
set.seed(1010)
d10 <- data.frame(
  id = paste0("sub_", sprintf("%04d", 1:(n10_t + n10_c))),
  treat = c(rep(1, n10_t), rep(0, n10_c)),
  x = c(rnorm(n10_t, mean = 2, sd = 4), rnorm(n10_c, mean = 0, sd = 1))
)
fixtures[[10]] <- save_fixture("fix_10_whole_vs_pooled_sd", "Whole-sample vs pooled SD difference",
  "Treated SD=4, Control SD=1, tests MatchIt whole-sample caliper standardization",
  d10, "treat ~ x", "glm", "linear.logit", 0.2, TRUE, "none", 1, FALSE, "largest", "SUCCESS")

# 11. Pre-match discarded units
set.seed(1111)
n11 <- 200
d11 <- data.frame(
  id = paste0("sub_", sprintf("%04d", 1:n11)),
  treat = rep(c(1, 0), each = 100),
  x = c(rnorm(100, mean = 3, sd = 1), rnorm(100, mean = 0, sd = 1))
)
fixtures[[11]] <- save_fixture("fix_11_pre_match_discard", "Pre-match discarded units",
  "discard=both on non-overlapping regions",
  d11, "treat ~ x", "glm", "linear.logit", NULL, FALSE, "both", 1, FALSE, "largest", "SUCCESS")

# 12. Caliper-unmatched units
fixtures[[12]] <- save_fixture("fix_12_caliper_unmatched", "Caliper unmatched units",
  "Strict caliper=0.05 resulting in unmatched treated units",
  d1, "treat ~ age + bmi + sbp", "glm", "linear.logit", 0.05, FALSE, "none", 1, FALSE, "largest", "SUCCESS")

# 13. More treated units than controls
n13_t <- 150
n13_c <- 75
set.seed(1313)
d13 <- data.frame(
  id = paste0("sub_", sprintf("%04d", 1:(n13_t + n13_c))),
  treat = c(rep(1, n13_t), rep(0, n13_c)),
  x1 = rnorm(n13_t + n13_c),
  x2 = rnorm(n13_t + n13_c)
)
fixtures[[13]] <- save_fixture("fix_13_more_treated_than_control", "More treated than control",
  "150 treated, 75 controls: ratio=1 without replacement forces 75 treated unmatched",
  d13, "treat ~ x1 + x2", "glm", "linear.logit", NULL, FALSE, "none", 1, FALSE, "largest", "SUCCESS")

# 14. More controls than treated units
n14_t <- 40
n14_c <- 280
set.seed(1414)
d14 <- data.frame(
  id = paste0("sub_", sprintf("%04d", 1:(n14_t + n14_c))),
  treat = c(rep(1, n14_t), rep(0, n14_c)),
  x1 = rnorm(n14_t + n14_c),
  x2 = rnorm(n14_t + n14_c)
)
fixtures[[14]] <- save_fixture("fix_14_more_controls_than_treated", "More controls than treated",
  "40 treated, 280 controls (1:7 candidate pool)",
  d14, "treat ~ x1 + x2", "glm", "linear.logit", NULL, FALSE, "none", 1, FALSE, "largest", "SUCCESS")

# 15. Quasi-separation
n15 <- 100
set.seed(1515)
d15 <- data.frame(
  id = paste0("sub_", sprintf("%04d", 1:n15)),
  treat = c(rep(1, 50), rep(0, 50)),
  x_quasi = c(rep(1, 49), 0, rep(0, 48), 1, 1),
  x_norm = rnorm(n15)
)
fixtures[[15]] <- save_fixture("fix_15_quasi_separation", "Quasi-separation",
  "Near-perfect separation creating large GLM coefficients and warnings",
  d15, "treat ~ x_quasi + x_norm", "glm", "linear.logit", NULL, FALSE, "none", 1, FALSE, "largest", "SUCCESS_WITH_WARNING")

# 16. Complete separation
n16 <- 80
d16 <- data.frame(
  id = paste0("sub_", sprintf("%04d", 1:n16)),
  treat = rep(c(1, 0), each = 40),
  x_sep = rep(c(10, -10), each = 40)
)
fixtures[[16]] <- save_fixture("fix_16_complete_separation", "Complete separation",
  "Covariate perfectly predicts treatment; GLM non-convergence",
  d16, "treat ~ x_sep", "glm", "linear.logit", NULL, FALSE, "none", 1, FALSE, "largest", "SUCCESS_WITH_WARNING")

# 17. Rank-deficient design matrix
n17 <- 100
set.seed(1717)
x_base <- rnorm(n17)
d17 <- data.frame(
  id = paste0("sub_", sprintf("%04d", 1:n17)),
  treat = rbinom(n17, 1, 0.4),
  x1 = x_base,
  x2 = 2 * x_base
)
fixtures[[17]] <- save_fixture("fix_17_rank_deficient", "Rank-deficient design matrix",
  "x2 is exact multiple of x1; GLM drops rank-deficient column",
  d17, "treat ~ x1 + x2", "glm", "linear.logit", NULL, FALSE, "none", 1, FALSE, "largest", "SUCCESS")

# 18. Zero-variance covariate
n18 <- 100
set.seed(1818)
d18 <- data.frame(
  id = paste0("sub_", sprintf("%04d", 1:n18)),
  treat = rbinom(n18, 1, 0.4),
  x1 = rnorm(n18),
  x_const = rep(5.0, n18)
)
fixtures[[18]] <- save_fixture("fix_18_zero_variance", "Zero-variance covariate",
  "x_const has 0 variance; dropped from GLM",
  d18, "treat ~ x1 + x_const", "glm", "linear.logit", NULL, FALSE, "none", 1, FALSE, "largest", "SUCCESS")

# 19. Missing treatment or selected covariates
n19 <- 100
set.seed(1919)
d19 <- data.frame(
  id = paste0("sub_", sprintf("%04d", 1:n19)),
  treat = rbinom(n19, 1, 0.4),
  x1 = rnorm(n19),
  x2 = rnorm(n19)
)
d19$x1[5] <- NA
d19$treat[12] <- NA
fixtures[[19]] <- save_fixture("fix_19_missing_values", "Missing values in data",
  "NA in treatment and covariate; MatchIt errors on unhandled NA",
  d19, "treat ~ x1 + x2", "glm", "linear.logit", NULL, FALSE, "none", 1, FALSE, "largest", "EXPECTED_ERROR_MISSING")

# 20. Malformed category and invalid factor levels
n20 <- 100
set.seed(2020)
d20 <- data.frame(
  id = paste0("sub_", sprintf("%04d", 1:n20)),
  treat = rbinom(n20, 1, 0.4),
  x1 = rnorm(n20),
  cat_var = factor(c("solo_level", rep("A", 49), rep("B", 50)))
)
fixtures[[20]] <- save_fixture("fix_20_malformed_category", "Single-unit factor level",
  "Factor level with only 1 observation",
  d20, "treat ~ x1 + cat_var", "glm", "linear.logit", NULL, FALSE, "none", 1, FALSE, "largest", "SUCCESS")

# 21. Extreme propensity scores
n21 <- 120
d21 <- data.frame(
  id = paste0("sub_", sprintf("%04d", 1:n21)),
  treat = rep(c(1, 0), each = 60),
  x_ext = c(rnorm(60, mean = 10, sd = 1), rnorm(60, mean = -10, sd = 1))
)
fixtures[[21]] <- save_fixture("fix_21_extreme_propensities", "Extreme propensity scores",
  "Propensity scores near 0 and 1; numerical stability check",
  d21, "treat ~ x_ext", "glm", "linear.logit", NULL, FALSE, "none", 1, FALSE, "largest", "SUCCESS_WITH_WARNING")

# 22. Small or degenerate samples
n22 <- 10
d22 <- data.frame(
  id = paste0("sub_", sprintf("%02d", 1:n22)),
  treat = c(rep(1, 4), rep(0, 6)),
  x = c(1.1, 1.2, 1.3, 1.4, 0.9, 1.0, 1.1, 1.5, 1.6, 1.7)
)
fixtures[[22]] <- save_fixture("fix_22_small_sample", "Small degenerate sample",
  "N=10 (4 treated, 6 controls)",
  d22, "treat ~ x", "glm", "linear.logit", NULL, FALSE, "none", 1, FALSE, "largest", "SUCCESS")

# 23. No eligible match (strict caliper across disjoint groups)
n23 <- 40
d23 <- data.frame(
  id = paste0("sub_", sprintf("%02d", 1:n23)),
  treat = rep(c(1, 0), each = 20),
  x = c(rep(100, 20), rep(-100, 20))
)
fixtures[[23]] <- save_fixture("fix_23_no_eligible_match", "No eligible match",
  "Strict caliper=0.01 between disjoint groups results in 0 matches",
  d23, "treat ~ x", "glm", "linear.logit", 0.01, FALSE, "none", 1, FALSE, "largest", "EXPECTED_ZERO_MATCHES")

# 24. Duplicate row IDs
d24 <- d1[1:50, ]
d24$id[2] <- d24$id[1] # force duplicate ID
fixtures[[24]] <- save_fixture("fix_24_duplicate_ids", "Duplicate unit IDs",
  "Contains duplicate row identifier; ClinicalPSM policy rejection",
  d24, "treat ~ age + bmi + sbp", "glm", "linear.logit", NULL, FALSE, "none", 1, FALSE, "largest", "CLINICALPSM_POLICY_REJECT")

# Output master manifest
cat(sprintf("Generated %d fixtures.\n", length(fixtures)))
