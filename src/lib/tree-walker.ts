/**
 * LightGBM tree-walker for residual model inference.
 * Reads exported JSON trees and predicts residual quantiles.
 */

export interface TreeNode {
  sf?: number;      // split_feature index
  th?: number;      // threshold (numerical split)
  lc?: TreeNode;    // left child (<= threshold)
  rc?: TreeNode;    // right child (> threshold)
  lv?: number;      // leaf value (terminal node)
  cat?: number[];   // categorical values that go left
}

export interface QuantileModel {
  trees: TreeNode[];
}

export interface ResidualModel {
  version: string;
  trainedAt: string;
  features: string[];
  categoricalFeatures: Record<string, Record<string, number>>;
  quantiles: {
    p10: QuantileModel;
    p50: QuantileModel;
    p90: QuantileModel;
  };
  stationsWithResidual: string[];
  metrics: Record<string, number>;
}

function walkTree(node: TreeNode, featureValues: number[]): number {
  // Leaf node
  if (node.lv !== undefined) return node.lv;

  const featureIdx = node.sf!;
  const value = featureValues[featureIdx];

  // Categorical split
  if (node.cat !== undefined) {
    // Go left if value is in the categorical set
    return node.cat.includes(value)
      ? walkTree(node.lc!, featureValues)
      : walkTree(node.rc!, featureValues);
  }

  // Numerical split
  return value <= node.th!
    ? walkTree(node.lc!, featureValues)
    : walkTree(node.rc!, featureValues);
}

function predictQuantile(model: QuantileModel, featureValues: number[]): number {
  // Sum predictions from all trees (boosting)
  let sum = 0;
  for (const tree of model.trees) {
    sum += walkTree(tree, featureValues);
  }
  return sum;
}

export function predictResidual(
  model: ResidualModel,
  features: Record<string, number>
): { p10: number; p50: number; p90: number } {
  // Convert named features to ordered array matching model.features
  const featureValues = model.features.map(name => features[name] ?? -1);

  return {
    p10: predictQuantile(model.quantiles.p10, featureValues),
    p50: predictQuantile(model.quantiles.p50, featureValues),
    p90: predictQuantile(model.quantiles.p90, featureValues),
  };
}
