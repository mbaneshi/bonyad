| Key | v | Kind | Effect | Inputs | Outputs | Errors |
|---|---|---|---|---|---|---|
| `drawing.create_entity` | 1 | Command | ProducesNew | geometry, id, expected_head | entity, new_head | revision_conflict, non_finite_coordinate, zero_length_line, too_few_vertices, degenerate_surface, self_intersecting_surface |
| `drawing.update_geometry` | 1 | Command | MutatesInPlace | entity, geometry, expected | new_revision, new_head | entity_missing, revision_conflict, kind_mismatch, non_finite_coordinate, zero_length_line, too_few_vertices, degenerate_surface, self_intersecting_surface |
| `drawing.delete_entity` | 1 | Command | MutatesInPlace | entity, expected | new_head | entity_missing, revision_conflict, entity_in_use |
| `drawing.measure_entity` | 1 | Calculation | Pure | entity | measure, input_revision | entity_missing, not_measurable |
| `drawing.validate_geometry` | 1 | Validator | Pure | geometry | valid | non_finite_coordinate, zero_length_line, too_few_vertices, degenerate_surface, self_intersecting_surface |
| `solid.extrude` | 1 | Derivation | ProducesNew | profile, extent, operation, targets, thin | change | profile_not_closed, profile_self_intersecting, extent_degenerate, direction_parallel_to_profile, taper_collapses_shape, target_missing, kernel_failed |
| `solid.revolve` | 1 | Derivation | ProducesNew | profile, axis, angle, symmetric, operation, targets | change | profile_not_closed, axis_invalid, angle_invalid, axis_crosses_profile, target_missing, kernel_failed |
| `solid.sweep` | 1 | Derivation | ProducesNew | profile, path, orientation, twist, scale, operation, targets | change | profile_not_closed, path_invalid, path_sharp_curvature, target_missing, kernel_failed |
| `solid.loft` | 1 | Derivation | ProducesNew | sections, rails, closed, operation, targets | change | too_few_sections, sections_incompatible, rail_misses_section, target_missing, kernel_failed |
| `solid.boolean` | 1 | Derivation | ConsumesInputs | target, tools, op, keep_tools | change | operand_missing, body_combined_with_itself, no_tools, operand_not_solid, no_overlap, kernel_failed |
| `solid.fillet` | 1 | Derivation | ProducesNew | edges, radius, style, fit, corner | change | no_edge_resolved, radius_not_positive, radius_too_large, edges_on_different_bodies, blend_failed |
| `solid.chamfer` | 1 | Derivation | ProducesNew | edges, distance, distance2, flip | change | no_edge_resolved, distance_not_positive, distance_too_large, edges_share_no_face, blend_failed |
| `solid.shell` | 1 | Derivation | ProducesNew | faces, thickness, direction, tangent_chain | change | no_face_resolved, thickness_not_positive, face_not_on_body, result_invalid, kernel_failed |
| `solid.offset` | 1 | Derivation | ProducesNew | body, distance | change | body_missing, distance_zero, self_intersection_after_offset, kernel_failed |
| `solid.slice` | 1 | Derivation | ProducesNew | body, plane, keep_side | change | body_missing, plane_does_not_cut, keep_point_on_plane, kernel_failed |
| `solid.section` | 1 | Calculation | Pure | body, plane | regions | body_missing, plane_does_not_cut, kernel_failed |
| `solid.hole` | 1 | Derivation | ProducesNew | face, position, direction, kind, diameter, depth | change | face_not_resolved, diameter_not_positive, depth_invalid, kernel_failed |
| `solid.pattern` | 1 | Derivation | ProducesNew | features, bodies, kind | change | nothing_to_pattern, count_invalid, instances_overlap, kernel_failed |
| `solid.mirror` | 1 | Derivation | ProducesNew | features, bodies, plane | change | nothing_to_mirror, plane_invalid, kernel_failed |
| `solid.create_primitive` | 1 | Command | ProducesNew | shape | body | dimension_not_positive, non_finite_value, axis_zero, kernel_failed |
| `solid.transform_bodies` | 1 | Command | MutatesInPlace | bodies, transform | change | body_missing, transform_singular, transform_not_rigid |
| `solid.stitch` | 1 | Command | MutatesInPlace | body, tolerance, orient | stitched_edges, produces_solid, max_vertex_gap, max_edge_gap | body_missing, tolerance_invalid, nothing_to_stitch |
| `solid.heal` | 1 | Command | MutatesInPlace | body, tolerance | repairs_attempted, repairs_succeeded, issues_remaining | body_missing, tolerance_invalid |
| `solid.unify_normals` | 1 | Command | MutatesInPlace | body | flipped_faces | body_missing, non_manifold |
| `solid.mass_properties` | 1 | Calculation | Pure | body, relative_accuracy, density, origin | area, volume, mass, centroid, inertia, accuracy_used | body_missing, not_manifold_solid, density_invalid, accuracy_invalid, non_finite_value, mass_attribute_conflict, degenerate_mass |
| `solid.closest_point` | 1 | Query | Pure | body, point | closest, distance, face | body_missing, non_finite_value |
| `solid.is_manifold_solid` | 1 | Validator | Pure | body | manifold, closed, consistent_orientation, shells | body_missing |
| `solid.intersect_surfaces` | 1 | Calculation | Pure | a, b, approx_tolerance, angle_tolerance | curves | face_not_resolved, surface_degenerate, surfaces_coincident |
| `solid.tessellate` | 1 | Derivation | ProducesNew | body, chord_tolerance, angle_tolerance | mesh, triangles | body_missing, tolerance_invalid, face_not_tessellable |
| `solid.check_postconditions` | 1 | Validator | Pure | body, conditions | results | body_missing, no_conditions |
| `sketch.solve` | 1 | Calculation | Pure | sketch, hold | status, dof, iterations, max_residual, failing, redundant, folded, solved | sketch_missing, constraint_malformed, too_many_variables, non_finite_value |
| `sketch.apply_solution` | 1 | Command | MutatesInPlace | sketch, solved, expected | new_revision | sketch_missing, revision_conflict, point_missing |
| `sketch.add_constraint` | 1 | Command | MutatesInPlace | sketch, constraint, expected | constraint_id, new_revision | sketch_missing, revision_conflict, reference_missing, redundant, conflicting |
| `sketch.set_dimension` | 1 | Command | MutatesInPlace | sketch, constraint_id, value, expected | new_revision | sketch_missing, revision_conflict, constraint_missing, not_a_dimension, expression_invalid |
| `sketch.find_profiles` | 1 | Calculation | Pure | sketch | profiles, loose_ends | sketch_missing, no_closed_loop |
| `timeline.add_feature` | 1 | Command | MutatesInPlace | design, procedure, input_json, position, expected | feature, new_revision, rebuild_from | design_missing, revision_conflict, procedure_unknown, procedure_version_unsupported, procedure_not_a_feature, input_malformed, position_out_of_range |
| `timeline.suppress_feature` | 1 | Command | MutatesInPlace | design, feature, suppressed, expected | new_revision, rebuild_from, dependants_affected | design_missing, feature_missing, revision_conflict |
| `timeline.remove_feature` | 1 | Command | MutatesInPlace | design, feature, expected | new_revision, rebuild_from | design_missing, feature_missing, revision_conflict, feature_in_use |
| `timeline.reorder_feature` | 1 | Command | MutatesInPlace | design, feature, new_position, expected | new_revision, rebuild_from | design_missing, feature_missing, revision_conflict, position_out_of_range, would_break_dependency |
| `timeline.roll_back_to` | 1 | Command | MutatesInPlace | design, position, expected | new_revision, features_skipped | design_missing, revision_conflict, position_out_of_range |
| `timeline.set_design_parameter` | 1 | Command | MutatesInPlace | design, name, value, expected | new_revision, features_affected, rebuild_from | design_missing, revision_conflict, parameter_missing, expression_invalid, unit_mismatch, parameter_cycle |
| `timeline.rebuild` | 1 | Derivation | ProducesNew | design, from_position, live_drag | recomputed, restored, skipped, failed, stale | design_missing, position_out_of_range, procedure_unknown, timeline_cycle |
| `project.commit_changeset` | 1 | Command | MutatesInPlace | project, expected_head, request_id, changes | new_head, applied | project_missing, revision_conflict, empty_changeset, procedure_unknown, procedure_version_unsupported, change_rejected, input_malformed |
| `project.undo` | 1 | Command | MutatesInPlace | project, expected_head | new_head, reverted | project_missing, revision_conflict, nothing_to_undo |
| `project.redo` | 1 | Command | MutatesInPlace | project, expected_head | new_head, reapplied | project_missing, revision_conflict, nothing_to_redo |
| `project.dependents` | 1 | Query | Pure | entity | dependents | entity_missing |
| `project.verify_registry` | 1 | Query | Pure |  | registered, missing_in_code, missing_in_database, version_mismatches | database_unreachable |
| `mesh.poly_extrude` | 1 | Command | MutatesInPlace | selection, height, as_group, expected | created_polygons, new_revision | selection_empty, selection_kind_wrong, revision_conflict, height_not_finite |
| `mesh.poly_bevel` | 1 | Command | MutatesInPlace | selection, height, outline, expected | created_polygons, new_revision | selection_empty, selection_kind_wrong, revision_conflict, outline_too_large |
| `mesh.poly_inset` | 1 | Command | MutatesInPlace | selection, amount, by_polygon, expected | created_polygons, new_revision | selection_empty, selection_kind_wrong, revision_conflict, amount_too_large |
| `mesh.poly_chamfer` | 1 | Command | MutatesInPlace | selection, amount, segments, expected | created_polygons, new_revision | selection_empty, selection_kind_wrong, revision_conflict, amount_too_large, segments_invalid |
| `mesh.weld` | 1 | Command | MutatesInPlace | selection, threshold, expected | vertices_removed, new_revision | selection_empty, revision_conflict, threshold_invalid |
| `mesh.attach` | 1 | Command | ConsumesInputs | target, others, expected | new_revision, absorbed | mesh_missing, revision_conflict, attached_to_itself |
| `mesh.subdivide` | 1 | Derivation | ProducesNew | mesh, iterations, scheme | mesh, polygons | mesh_missing, iterations_too_many, mesh_not_manifold |
| `mesh.boolean` | 1 | Derivation | ProducesNew | a, b, op | mesh | mesh_missing, operand_not_closed, operand_not_manifold, self_intersecting |
| `mesh.mirror` | 1 | Derivation | ProducesNew | mesh, plane, weld_seam, weld_threshold | mesh | mesh_missing, plane_invalid, threshold_invalid |
| `mesh.solidify` | 1 | Derivation | ProducesNew | mesh, thickness, direction | mesh | mesh_missing, thickness_zero, mesh_not_manifold |
| `mesh.decimate` | 1 | Derivation | ProducesNew | mesh, target, preserve_boundary | mesh, triangles_before, triangles_after, deviation | mesh_missing, target_invalid, mesh_not_triangulated |
| `mesh.repair` | 1 | Derivation | ProducesNew | mesh, fill_holes, remove_duplicates, remove_degenerate | mesh, holes_filled, duplicates_removed, degenerate_removed | mesh_missing, nothing_to_repair |
| `mesh.measure` | 1 | Calculation | Pure | mesh | area, volume, closed, manifold, consistent_orientation, components, bounds | mesh_missing, mesh_empty |
| `mesh.deviation` | 1 | Validator | Pure | reference, candidate, samples | forward, backward | mesh_missing, samples_invalid, mesh_empty |
| `scene.evaluate_stack` | 1 | Derivation | ProducesNew | node, time | evaluated, modifiers_applied, modifiers_skipped | node_missing, modifier_failed, modifier_cycle |
| `scene.collapse_stack` | 1 | Command | MutatesInPlace | node, up_to_modifier, expected | new_revision, modifiers_collapsed, instance_links_broken | node_missing, revision_conflict, stack_empty, modifier_failed |
| `scene.set_pivot` | 1 | Command | MutatesInPlace | node, new_pivot, expected | new_revision, node_transform, offset_transform | node_missing, revision_conflict, non_finite_value |
| `scene.world_transform` | 1 | Calculation | Pure | node, time | node_transform, object_transform | node_missing, parent_cycle, transform_singular |
| `scene.evaluate_controller` | 1 | Calculation | Pure | controller, time | value, valid_for | controller_missing, time_not_finite, controller_cycle |
| `scene.skin_deform` | 1 | Derivation | ProducesNew | node, time, dual_quaternion | deformed | node_missing, not_skinned, weights_invalid, bone_missing |
| `scene.clone_node` | 1 | Command | ProducesNew | node, mode, new_name | clone, shares_base, shares_modifiers | node_missing, name_taken |
| `scene.compose_layers` | 1 | Derivation | ProducesNew | layers, load_payloads | stage, prims, unresolved_references | layer_missing, layer_cycle, no_layers |
| `scene.resolve_value` | 1 | Query | Pure | stage, prim_path, attribute, time | value, authored_in | stage_missing, prim_not_found, attribute_not_found, path_invalid |
| `scene.resolve_placement` | 1 | Calculation | Pure | definition, occurrence | world, world_bounds | definition_missing, occurrence_missing, occurrence_does_not_reference_definition |
| `civil.alignment_station_to_point` | 1 | Calculation | Pure | alignment, station, offset | point, direction | alignment_missing, station_out_of_range, non_finite_value, station_ambiguous |
| `civil.alignment_point_to_station` | 1 | Calculation | Pure | alignment, point | station, offset | alignment_missing, non_finite_value, point_beyond_ends |
| `civil.alignment_validate` | 1 | Validator | Pure | alignment | valid, total_length, end_station | alignment_missing, too_few_elements, element_invalid, station_equation_invalid |
| `civil.alignment_set_station_equations` | 1 | Command | MutatesInPlace | alignment, equations, expected | new_revision, dependants_to_check | alignment_missing, revision_conflict, station_equation_invalid, dependent_profile_out_of_range |
| `civil.profile_elevation_at` | 1 | Calculation | Pure | profile, station | elevation, grade | profile_missing, station_outside_profile, non_finite_value |
| `civil.profile_fits_alignment` | 1 | Validator | Pure | profile, alignment | fits, out_of_range_pvis | profile_missing, alignment_missing, profile_not_on_this_alignment, stations_not_increasing |
| `civil.tin_edit_definition` | 1 | Command | MutatesInPlace | surface, operations, expected | new_revision, full_rebuild_required | surface_missing, revision_conflict, operation_invalid, duplicate_xy_different_z |
| `civil.tin_build` | 1 | Derivation | ProducesNew | surface, options | triangles, points_merged, triangles_trimmed, extent | surface_missing, too_few_points, all_collinear, crossing_breaklines, options_invalid |
| `civil.tin_elevation_at` | 1 | Calculation | Pure | surface, point | elevation | surface_missing, outside_surface, surface_not_built, non_finite_value |
| `civil.earthwork_shared_triangulation` | 1 | Calculation | Pure | vertices, triangles, min_triangle_area | volumes | empty_input, triangle_index_out_of_range, degenerate_triangle, non_finite_value, invalid_tolerance |
| `civil.earthwork_composite` | 1 | Calculation | Pure | existing, design, overlap | volumes, overlap_area, uncovered_area | surface_missing, surface_not_built, no_overlap, partial_overlap |
| `civil.earthwork_grid` | 1 | Calculation | Pure | existing, design, spacing, orientation | volumes, samples, samples_outside | surface_missing, surface_not_built, spacing_invalid, no_overlap |
| `civil.earthwork_sections` | 1 | Calculation | Pure | sample_lines, existing, design, method, curve_correction | volumes, per_line, lines_outside | sample_lines_missing, surface_missing, curve_correction_not_allowed, line_outside_surface |
| `civil.volume_surface_create` | 1 | Command | ProducesNew | name, base, comparison | volume_surface | surface_missing, name_taken, same_surface |
| `civil.bounded_volume` | 1 | Calculation | Pure | surface, boundary | volumes | surface_missing, boundary_invalid, boundary_outside_surface |
| `civil.corridor_build` | 1 | Derivation | ProducesNew | corridor, frequency, regions | stations_built, surfaces_created, targets_unset | corridor_missing, baseline_invalid, assembly_missing, region_out_of_range, target_unset |
| `civil.feature_line_set_grade` | 1 | Command | MutatesInPlace | feature_line, from_vertex, grade, expected | new_revision, crossings_resolved | feature_line_missing, revision_conflict, vertex_out_of_range, grade_not_finite |
| `civil.pipe_network_solve` | 1 | Derivation | ProducesNew | network, surface | rule_violations, structures_moved | network_missing, disconnected_pipe, surface_missing, rule_conflict |
| `civil.parcel_closure` | 1 | Calculation | Pure | start, segments, use_label_precision | area, perimeter, closure_error, precision_ratio | no_segments, non_finite_value, zero_perimeter |
| `civil.survey_adjust` | 1 | Calculation | Pure | network, observations, fixed, max_iterations | adjusted, iterations, converged, reference_variance, largest_residual | network_missing, no_fixed_point, under_determined, observation_invalid, std_dev_not_positive |
| `bim.place_instance` | 1 | Command | ProducesNew | element_type, placement, expected | element, new_revision, nested_created | type_missing, revision_conflict, host_required, host_missing, level_missing, wrong_overload_for_category |
| `bim.change_type` | 1 | Command | MutatesInPlace | element, new_type, expected | new_revision, parameters_changed | element_missing, type_missing, revision_conflict, type_category_mismatch |
| `bim.set_parameter` | 1 | Command | MutatesInPlace | element, name, value, scope, expected | new_revision, dependants | element_missing, revision_conflict, parameter_missing, parameter_read_only, value_type_mismatch, not_owned |
| `bim.regenerate` | 1 | Derivation | MutatesInPlace | elements | regenerated, failed | element_missing, regeneration_failed, circular_dependency |
| `bim.create_wall` | 1 | Command | ProducesNew | path, level, wall_type, height, expected | wall, new_revision, joins_created | level_missing, type_missing, revision_conflict, path_too_short, height_not_positive, zero_length_segment |
| `bim.join_geometry` | 1 | Command | MutatesInPlace | a, b, expected | new_revision | element_missing, revision_conflict, no_shared_face, already_joined |
| `bim.room_compute` | 1 | Calculation | Pure | room, settings | area, perimeter, volume, loops | room_missing, room_not_enclosed, room_not_placed, settings_invalid |
| `bim.room_create` | 1 | Command | ProducesNew | level, point, name, expected | room, new_revision | level_missing, revision_conflict, point_not_in_enclosure |
| `bim.quantity_takeoff` | 1 | Calculation | Pure | elements, quantity | total, lines | element_missing, quantity_not_available, no_elements |
| `bim.set_phase` | 1 | Command | MutatesInPlace | elements, created, demolished, expected | new_revision | element_missing, phase_missing, revision_conflict, phases_not_modifiable, demolished_before_created |
| `bim.activate_design_option` | 1 | Command | MutatesInPlace | option, expected | new_revision | option_missing, revision_conflict |
| `bim.workset_checkout` | 1 | Command | MutatesInPlace | elements, worksets | owned, not_granted | element_missing, workset_missing, request_too_large, updated_in_central, deleted_in_central |
| `bim.workset_relinquish` | 1 | Command | MutatesInPlace | elements | released | element_missing, not_owned |
| `bim.query_elements` | 1 | Query | Pure | filters, limit | elements, truncated | filter_invalid, no_filters |
| `bim.assign_container` | 1 | Command | MutatesInPlace | elements, container, expected | new_revision | element_missing, container_missing, revision_conflict, container_cycle |
| `bim.check_constraints` | 1 | Validator | Pure | elements, rules | violations, checked | element_missing, rule_unknown |
| `bim.map_external_id` | 1 | Query | Pure | external | element, ambiguous | source_unsupported, id_malformed |
| `cae.mesh_tet` | 1 | Derivation | ProducesNew | model, body, size, order, tolerance | elements, nodes, quality, results_invalidated | model_missing, body_missing, size_invalid, surface_invalid, validity_gate_failed |
| `cae.mesh_hex` | 1 | Derivation | ProducesNew | model, body, size, order, method | elements, nodes, quality, results_invalidated | model_missing, body_missing, size_invalid, no_structured_method_fits, seeds_cannot_all_hold |
| `cae.mesh_quality` | 1 | Validator | Pure | model | quality | model_missing, no_mesh |
| `cae.define_material` | 1 | Command | ProducesNew | model, name, law, expected | material, new_revision | model_missing, revision_conflict, name_taken, parameter_out_of_range, dimension_mismatch |
| `cae.define_section` | 1 | Command | ProducesNew | model, name, kind, material, body, expected | section, new_revision | model_missing, material_missing, body_missing, revision_conflict, name_taken, parameter_out_of_range |
| `cae.define_boundary_condition` | 1 | Command | ProducesNew | model, name, faces, kind, expected | boundary_condition, new_revision | model_missing, revision_conflict, name_taken, face_not_resolved, dimension_mismatch |
| `cae.define_load` | 1 | Command | ProducesNew | model, name, faces, kind, expected | load, new_revision | model_missing, revision_conflict, name_taken, face_not_resolved, dimension_mismatch |
| `cae.define_step` | 1 | Command | ProducesNew | model, name, boundary_conditions, loads, expected | step, new_revision | model_missing, revision_conflict, name_taken, definition_missing, no_boundary_conditions |
| `cae.check_model` | 1 | Validator | Pure | model, step | ready, errors, warnings, next_stage | model_missing, step_missing |
| `cae.solve_static` | 1 | Derivation | ProducesNew | model, step, max_dofs, threads | result, summary | model_not_ready, singular_system, limit_exceeded, rigid_body_motion, not_supported |
| `cae.solve_nonlinear` | 1 | Derivation | ProducesNew | model, step, increments, max_iterations | result, summary | model_not_ready, singular_system, limit_exceeded, increments_invalid, not_supported |
| `cae.solve_frequency` | 1 | Derivation | ProducesNew | model, step, modes | result, summary, frequencies | model_not_ready, modes_invalid, singular_system, limit_exceeded |
| `cae.solve_buckling` | 1 | Derivation | ProducesNew | model, step, modes | result, summary, load_factors | model_not_ready, modes_invalid, singular_system, limit_exceeded |
| `cae.solve_heat` | 1 | Derivation | ProducesNew | model, step, transient, end_time | result, summary | model_not_ready, time_invalid, singular_system, limit_exceeded |
| `cae.solve_explicit` | 1 | Derivation | ProducesNew | model, step, end_time, mass_scaling | result, summary, eroded_elements | model_not_ready, time_invalid, limit_exceeded, not_supported |
| `cae.solve_fluid` | 1 | Derivation | ProducesNew | model, step, max_cells, max_steps, estimate_only | result, summary, estimated_cells, estimated_steps, estimated_memory_bytes | model_not_ready, limit_exceeded, not_supported |
| `cae.extract_probe` | 1 | Query | Pure | result, field, point | value, element_found | result_missing, result_stale, point_outside_model, field_not_available |
| `cae.extract_reactions` | 1 | Query | Pure | result | per_set, total | result_missing, result_stale |
| `cae.export_deck` | 1 | External | WritesExternal | model, format, path, steps | bytes, sha256, unsupported | model_missing, model_not_ready, path_not_allowed, nothing_expressible |
| `io.import_file` | 1 | External | ReadsExternal | path, format, options, expected_sha256 | created, loss, file_sha256, unknown_extensions | path_not_allowed, file_not_found, hash_mismatch, format_unsupported, file_malformed, unit_ambiguous, frame_ambiguous, missing_reference |
| `io.export_file` | 1 | External | WritesExternal | entities, format, path, overwrite | bytes, sha256, loss | path_not_allowed, file_exists, format_unsupported, entity_not_exportable, nothing_to_export |
| `io.round_trip_check` | 1 | External | ReadsExternal | path, format, options | identical, loss, changed_entities | path_not_allowed, file_not_found, format_unsupported, file_malformed |
| `verify.verify_against_reference` | 1 | Validator | Pure | record, cases | checks, verdict | record_missing, no_cases, reason_missing, tolerance_negative, pointer_not_found, source_missing |
| `verify.compare_differential` | 1 | Validator | Pure | candidate, reference, rule | counters, mismatches, verdict | record_missing, rule_invalid, key_sets_differ |
| `verify.check_staleness` | 1 | Validator | Pure | record | stale, changed | record_missing, read_set_empty |
| `verify.selftest_comparator` | 1 | Validator | Pure | rule, sample | perturbations, caught, missed, verdict | record_missing, rule_invalid, nothing_to_perturb |
| `verify.assign_assurance` | 1 | Calculation | Pure | record, verdicts, proven | assurance | record_missing, contradictory_verdicts |
