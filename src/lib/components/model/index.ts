export { default as LpModelMatrix } from './LpModelMatrix.svelte';
export { default as MatrixThumb } from './MatrixThumb.svelte';
export {
	createLpMatrixModel,
	isLpEditableCell,
	isLpNameHeader,
	isLpNumericCell,
	loadLpMatrixModel,
	modelSourceKey,
	modelThumbCells,
	modelToTableauCells,
	tableauToModel
} from './lp-tableau';