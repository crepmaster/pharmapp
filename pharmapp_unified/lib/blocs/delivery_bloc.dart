import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:equatable/equatable.dart';
import '../models/delivery.dart';
import '../services/delivery_service.dart';

// Events
abstract class DeliveryEvent extends Equatable {
  @override
  List<Object?> get props => [];
}

class LoadAvailableDeliveries extends DeliveryEvent {}

class LoadCourierDeliveries extends DeliveryEvent {}

class LoadActiveDelivery extends DeliveryEvent {}

class AcceptDeliveryEvent extends DeliveryEvent {
  final String deliveryId;

  AcceptDeliveryEvent(this.deliveryId);

  @override
  List<Object?> get props => [deliveryId];
}

class UpdateDeliveryStatusEvent extends DeliveryEvent {
  final String deliveryId;
  final DeliveryStatus status;
  final String? notes;
  final List<String>? proofImages;

  UpdateDeliveryStatusEvent({
    required this.deliveryId,
    required this.status,
    this.notes,
    this.proofImages,
  });

  @override
  List<Object?> get props => [deliveryId, status, notes, proofImages];
}

class LoadCourierStats extends DeliveryEvent {}

// States
abstract class DeliveryState extends Equatable {
  @override
  List<Object?> get props => [];
}

class DeliveryInitial extends DeliveryState {}

class DeliveryLoading extends DeliveryState {}

class AvailableDeliveriesLoaded extends DeliveryState {
  final List<Delivery> deliveries;

  AvailableDeliveriesLoaded(this.deliveries);

  @override
  List<Object?> get props => [deliveries];
}

class CourierDeliveriesLoaded extends DeliveryState {
  final List<Delivery> deliveries;

  CourierDeliveriesLoaded(this.deliveries);

  @override
  List<Object?> get props => [deliveries];
}

class ActiveDeliveryLoaded extends DeliveryState {
  final Delivery? delivery;

  ActiveDeliveryLoaded(this.delivery);

  @override
  List<Object?> get props => [delivery];
}

class DeliveryAccepted extends DeliveryState {
  final String deliveryId;

  DeliveryAccepted(this.deliveryId);

  @override
  List<Object?> get props => [deliveryId];
}

class DeliveryStatusUpdated extends DeliveryState {
  final String deliveryId;
  final DeliveryStatus status;

  DeliveryStatusUpdated(this.deliveryId, this.status);

  @override
  List<Object?> get props => [deliveryId, status];
}

class CourierStatsLoaded extends DeliveryState {
  final Map<String, dynamic> stats;

  CourierStatsLoaded(this.stats);

  @override
  List<Object?> get props => [stats];
}

class DeliveryError extends DeliveryState {
  final String error;

  DeliveryError(this.error);

  @override
  List<Object?> get props => [error];
}

// BLoC
class DeliveryBloc extends Bloc<DeliveryEvent, DeliveryState> {
  DeliveryBloc() : super(DeliveryInitial()) {
    on<LoadAvailableDeliveries>(_onLoadAvailableDeliveries);
    on<LoadCourierDeliveries>(_onLoadCourierDeliveries);
    on<LoadActiveDelivery>(_onLoadActiveDelivery);
    on<AcceptDeliveryEvent>(_onAcceptDelivery);
    on<UpdateDeliveryStatusEvent>(_onUpdateDeliveryStatus);
    on<LoadCourierStats>(_onLoadCourierStats);
  }

  Future<void> _onLoadAvailableDeliveries(
    LoadAvailableDeliveries event,
    Emitter<DeliveryState> emit,
  ) async {
    emit(DeliveryLoading());
    try {
      // Use stream and listen for first value
      final stream = DeliveryService.getAvailableDeliveries();
      await emit.forEach<List<Delivery>>(
        stream,
        onData: (deliveries) => AvailableDeliveriesLoaded(deliveries),
        onError: (error, stackTrace) => DeliveryError(error.toString()),
      );
    } catch (e) {
      emit(DeliveryError('Failed to load available deliveries: $e'));
    }
  }

  Future<void> _onLoadCourierDeliveries(
    LoadCourierDeliveries event,
    Emitter<DeliveryState> emit,
  ) async {
    emit(DeliveryLoading());
    try {
      final stream = DeliveryService.getCourierDeliveries();
      await emit.forEach<List<Delivery>>(
        stream,
        onData: (deliveries) => CourierDeliveriesLoaded(deliveries),
        onError: (error, stackTrace) => DeliveryError(error.toString()),
      );
    } catch (e) {
      emit(DeliveryError('Failed to load courier deliveries: $e'));
    }
  }

  Future<void> _onLoadActiveDelivery(
    LoadActiveDelivery event,
    Emitter<DeliveryState> emit,
  ) async {
    emit(DeliveryLoading());
    try {
      final stream = DeliveryService.getActiveDelivery();
      await emit.forEach<Delivery?>(
        stream,
        onData: (delivery) => ActiveDeliveryLoaded(delivery),
        onError: (error, stackTrace) => DeliveryError(error.toString()),
      );
    } catch (e) {
      emit(DeliveryError('Failed to load active delivery: $e'));
    }
  }

  Future<void> _onAcceptDelivery(
    AcceptDeliveryEvent event,
    Emitter<DeliveryState> emit,
  ) async {
    try {
      await DeliveryService.acceptDelivery(event.deliveryId);
      emit(DeliveryAccepted(event.deliveryId));
      // Reload active delivery after accepting
      add(LoadActiveDelivery());
    } catch (e) {
      emit(DeliveryError('Failed to accept delivery: $e'));
    }
  }

  Future<void> _onUpdateDeliveryStatus(
    UpdateDeliveryStatusEvent event,
    Emitter<DeliveryState> emit,
  ) async {
    try {
      await DeliveryService.updateDeliveryStatus(
        event.deliveryId,
        event.status,
        notes: event.notes,
        proofImages: event.proofImages,
      );
      emit(DeliveryStatusUpdated(event.deliveryId, event.status));
      // Reload active delivery after status update
      add(LoadActiveDelivery());
    } catch (e) {
      emit(DeliveryError('Failed to update delivery status: $e'));
    }
  }

  Future<void> _onLoadCourierStats(
    LoadCourierStats event,
    Emitter<DeliveryState> emit,
  ) async {
    emit(DeliveryLoading());
    try {
      final stats = await DeliveryService.getCourierStats();
      emit(CourierStatsLoaded(stats));
    } catch (e) {
      emit(DeliveryError('Failed to load courier stats: $e'));
    }
  }
}
